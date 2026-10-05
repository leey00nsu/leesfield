import { Prisma, type AssistantExecution } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { NodeExecutionActiveError, NodeExecutionNotFoundError, NodeExecutionInputError, NodeExecutionSelectionConflictError } from "@/server/node-executions/node-execution-errors";
import { assistantItemsSchema, assistantSelectionSchema, assistantTextForPort, assistantTextResult, type AssistantItem, type AssistantOutputMode } from "@/shared/generation-graph/assistant-output";

export type AssistantInputSnapshot = {
  instruction: string;
  outputMode?: AssistantOutputMode;
  text: string | null;
  assets: Array<{ assetId: string; type: "image" | "video"; portId: string; sortOrder: number }>;
};

export type AssistantLease = { token: string; version: number };
const LEASE_MS = 60_000;
const CLAIM_LOCK = 2_147_483_638;

export class AssistantLeaseLostError extends Error {
  constructor() { super("ASSISTANT_LEASE_LOST"); }
}

function leaseWhere(lease: AssistantLease, now = new Date()) {
  return {
    executionLeaseToken: lease.token,
    executionLeaseVersion: lease.version,
    executionLeaseUntil: { gt: now },
    status: "processing" as const,
    cancelRequestedAt: null,
  };
}

export async function createAssistantExecution(input: {
  ownerEmail: string;
  graphId: string;
  graphNodeId: string;
  modelKey: string;
  snapshot: AssistantInputSnapshot;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${CLAIM_LOCK})`);
    const active = await tx.assistantExecution.count({ where: {
      graphNodeId: input.graphNodeId, ownerEmail: input.ownerEmail,
      status: { in: ["pending", "processing"] },
    } });
    if (active) throw new NodeExecutionActiveError();
    return tx.assistantExecution.create({ data: {
      ownerEmail: input.ownerEmail,
      graphId: input.graphId,
      graphNodeId: input.graphNodeId,
      modelKey: input.modelKey,
      inputSnapshot: input.snapshot as unknown as Prisma.InputJsonValue,
    } });
  });
}

export async function listAssistantExecutions(ownerEmail: string, graphId: string, graphNodeId: string) {
  return prisma.assistantExecution.findMany({
    where: { ownerEmail, graphId, graphNodeId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20,
  });
}

export async function getAssistantExecution(ownerEmail: string, graphId: string, graphNodeId: string, id: string) {
  const row = await prisma.assistantExecution.findFirst({ where: { id, ownerEmail, graphId, graphNodeId } });
  if (!row) throw new NodeExecutionNotFoundError();
  return row;
}

export async function latestAssistantText(ownerEmail: string, graphId: string, graphNodeId: string, portId = "text") {
  const row = await prisma.assistantExecution.findFirst({
    where: { ownerEmail, graphId, graphNodeId, status: "completed", outputText: { not: null } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { outputText: true, outputListJson: true, selectedItemId: true },
  });
  return row ? assistantTextForPort(assistantTextResult(row.outputText, row.outputListJson, row.selectedItemId), portId) : null;
}

export async function selectAssistantItem(ownerEmail: string, graphId: string, graphNodeId: string, id: string, body: unknown) {
  const parsed = assistantSelectionSchema.safeParse(body);
  if (!parsed.success) throw new NodeExecutionInputError(parsed.error.flatten());
  return prisma.$transaction(async tx => {
    // Serialize selections with successful settlement, so an older run cannot
    // become writable between the latest-result check and the update.
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${CLAIM_LOCK})`);
    const row = await tx.assistantExecution.findFirst({ where: { id, ownerEmail, graphId, graphNodeId } });
    if (!row) throw new NodeExecutionNotFoundError();
    const node = await tx.generationGraphNode.findFirst({ where: { id: graphNodeId, graphId, kind: "generate.assistant", graph: { ownerEmail } } });
    if (!node) throw new NodeExecutionNotFoundError();
    const latest = await tx.assistantExecution.findFirst({ where: { ownerEmail, graphId, graphNodeId, status: "completed", outputText: { not: null } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
    if (row.status !== "completed" || latest?.id !== id || row.selectionVersion !== parsed.data.expectedSelectionVersion) throw new NodeExecutionSelectionConflictError();
    const items = assistantItemsSchema.safeParse(row.outputListJson);
    if (!items.success || !items.data.some(item => item.id === parsed.data.itemId)) throw new NodeExecutionInputError({ itemId: ["ASSISTANT_ITEM_INVALID"] });
    await tx.assistantExecution.update({ where: { id }, data: { selectedItemId: parsed.data.itemId, selectionVersion: { increment: 1 } } });
    return tx.assistantExecution.findUniqueOrThrow({ where: { id } });
  });
}

export async function cancelAssistantExecution(ownerEmail: string, graphId: string, graphNodeId: string, id: string) {
  const row = await getAssistantExecution(ownerEmail, graphId, graphNodeId, id);
  if (row.status === "pending") {
    await prisma.assistantExecution.updateMany({ where: { id, status: "pending" }, data: { status: "cancelled", completedAt: new Date() } });
  } else if (row.status === "processing") {
    await prisma.assistantExecution.updateMany({ where: { id, status: "processing" }, data: { cancelRequestedAt: new Date() } });
  }
  return getAssistantExecution(ownerEmail, graphId, graphNodeId, id);
}

export async function claimAssistantExecution(id: string): Promise<{ row: AssistantExecution; lease: AssistantLease } | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${CLAIM_LOCK})`);
    const now = new Date();
    await tx.assistantExecution.updateMany({
      where: { status: "processing", executionLeaseUntil: { lte: now } },
      data: { status: "failed", errorCode: "ASSISTANT_LEASE_EXPIRED", completedAt: now, executionLeaseToken: null, executionLeaseUntil: null },
    });
    const active = await tx.assistantExecution.count({ where: { status: "processing", executionLeaseUntil: { gt: now } } });
    if (active >= 4) return null;
    const current = await tx.assistantExecution.findUnique({ where: { id } });
    if (!current || current.status !== "pending") return null;
    const token = randomUUID();
    const version = current.executionLeaseVersion + 1;
    const claimed = await tx.assistantExecution.updateMany({
      where: { id, status: "pending", executionLeaseVersion: current.executionLeaseVersion },
      data: { status: "processing", executionLeaseToken: token, executionLeaseVersion: version,
        executionLeaseUntil: new Date(now.getTime() + LEASE_MS) },
    });
    if (!claimed.count) return null;
    return { row: { ...current, status: "processing" as const }, lease: { token, version } };
  });
}

export async function listPendingAssistantIds() {
  return prisma.assistantExecution.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 20, select: { id: true } });
}

export async function renewAssistantLease(id: string, lease: AssistantLease) {
  const now = new Date();
  const result = await prisma.assistantExecution.updateMany({
    where: { id, ...leaseWhere(lease, now) },
    data: { executionLeaseUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (!result.count) throw new AssistantLeaseLostError();
}

export async function settleAssistantExecution(id: string, lease: AssistantLease, result: { text: string; items?: AssistantItem[] } | { errorCode: string }) {
  return prisma.$transaction(async tx => {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${CLAIM_LOCK})`);
  const items = "text" in result && result.items ? assistantItemsSchema.parse(result.items) : null;
  const update = await tx.assistantExecution.updateMany({
    where: { id, ...leaseWhere(lease) },
    data: "text" in result
      ? { status: "completed", outputText: result.text, outputListJson: items ?? Prisma.DbNull, selectedItemId: items?.[0].id ?? null, completedAt: new Date(), executionLeaseToken: null, executionLeaseUntil: null }
      : { status: "failed", errorCode: result.errorCode, completedAt: new Date(), executionLeaseToken: null, executionLeaseUntil: null },
  });
  if (!update.count) throw new AssistantLeaseLostError();
  });
}

export async function finalizeAssistantCancellation(id: string, lease: AssistantLease) {
  const update = await prisma.assistantExecution.updateMany({
    where: { id, status: "processing", executionLeaseToken: lease.token, executionLeaseVersion: lease.version, cancelRequestedAt: { not: null } },
    data: { status: "cancelled", completedAt: new Date(), executionLeaseToken: null, executionLeaseUntil: null },
  });
  return update.count === 1;
}
