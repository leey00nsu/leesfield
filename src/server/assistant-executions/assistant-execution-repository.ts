import { Prisma, type AssistantExecution } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { NodeExecutionActiveError, NodeExecutionNotFoundError } from "@/server/node-executions/node-execution-errors";

export type AssistantInputSnapshot = {
  instruction: string;
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

export async function latestAssistantText(ownerEmail: string, graphId: string, graphNodeId: string) {
  const row = await prisma.assistantExecution.findFirst({
    where: { ownerEmail, graphId, graphNodeId, status: "completed", outputText: { not: null } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { outputText: true },
  });
  return row?.outputText ?? null;
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

export async function settleAssistantExecution(id: string, lease: AssistantLease, result: { text: string } | { errorCode: string }) {
  const update = await prisma.assistantExecution.updateMany({
    where: { id, ...leaseWhere(lease) },
    data: "text" in result
      ? { status: "completed", outputText: result.text, completedAt: new Date(), executionLeaseToken: null, executionLeaseUntil: null }
      : { status: "failed", errorCode: result.errorCode, completedAt: new Date(), executionLeaseToken: null, executionLeaseUntil: null },
  });
  if (!update.count) throw new AssistantLeaseLostError();
}

export async function finalizeAssistantCancellation(id: string, lease: AssistantLease) {
  const update = await prisma.assistantExecution.updateMany({
    where: { id, status: "processing", executionLeaseToken: lease.token, executionLeaseVersion: lease.version, cancelRequestedAt: { not: null } },
    data: { status: "cancelled", completedAt: new Date(), executionLeaseToken: null, executionLeaseUntil: null },
  });
  return update.count === 1;
}
