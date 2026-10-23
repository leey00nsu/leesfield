import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import { getLlmModelApiKey } from "@/server/model-catalog/model-credential";
import { AssistantProviderError, completeAssistant } from "@/server/assistant-executions/assistant-provider";
import { prepareAssistantVisuals } from "@/server/assistant-executions/assistant-visuals";
import { settleAssistantExecution, type AssistantInputSnapshot } from "@/server/assistant-executions/assistant-execution-repository";
import { assistantOutputModeSchema, AssistantListInvalidError, parseAssistantList, type AssistantItem } from "@/shared/generation-graph/assistant-output";
import { QueueContractError, type QueueFailure } from "../contracts";
import type { QueueHandler } from "../job-queue-handler";

export const assistantInputSnapshotSchema = z.object({
  promptProvenance: z.unknown().optional(), instruction: z.string().max(20_000),
  text: z.string().max(20_000).nullable(), outputMode: assistantOutputModeSchema.optional(),
  assets: z.array(z.object({ assetId: z.string(), type: z.enum(["image", "video"]),
    portId: z.string(), sortOrder: z.number().int() })).max(6),
}).strict();
export class AssistantQueueFailure extends Error {
  constructor(readonly failure: QueueFailure) { super(failure.code); }
}
function invalid(code: string): never {
  throw new AssistantQueueFailure({ code, phase: "input.validate", disposition: "terminal", executionStopped: true });
}
export const assistantQueueHandler: QueueHandler = {
  kind: "assistant",
  async prepareTx(tx, job, lease) {
    const result = await tx.assistantExecution.updateMany({
      where: { id: job.executionId, status: "pending", cancelRequestedAt: null },
      data: { status: "processing", executionLeaseToken: lease.token, executionLeaseVersion: lease.version,
        executionLeaseUntil: new Date(Date.now() + 60_000) },
    });
    if (result.count !== 1) throw new QueueContractError("QUEUE_SOURCE_NOT_PENDING");
  },
  async execute(job, context) {
    const row = await prisma.assistantExecution.findUniqueOrThrow({ where: { id: job.executionId } });
    const parsed = assistantInputSnapshotSchema.safeParse(row.inputSnapshot);
    if (!parsed.success) invalid("ASSISTANT_INPUT_INVALID");
    const snapshot = parsed.data as AssistantInputSnapshot;
    const node = await prisma.generationGraphNode.findFirst({ where: {
      id: row.graphNodeId, graphId: row.graphId, kind: "generate.assistant", graph: { ownerEmail: row.ownerEmail },
    } });
    if (!node) invalid("ASSISTANT_TARGET_INVALID");
    const model = (await getModelCatalog({ bypassCache: true })).find(m => m.type === "llm" && m.key === row.modelKey && m.isActive);
    if (!model || model.type !== "llm") invalid("ASSISTANT_MODEL_UNAVAILABLE");
    if (snapshot.assets.length && !model.providerConfig.supports_images) invalid("ASSISTANT_VISUAL_UNSUPPORTED");
    const visuals = await prepareAssistantVisuals(row.ownerEmail, snapshot, context.signal);
    const apiKey = await getLlmModelApiKey(row.modelKey);
    await context.assertOwned();
    const text = await completeAssistant({ baseUrl: model.providerConfig.base_url, modelId: model.providerConfig.model_id,
      timeoutMs: model.providerConfig.timeout_ms ?? 60_000, apiKey, instruction: snapshot.instruction,
      text: snapshot.text, visuals, signal: context.signal, outputMode: snapshot.outputMode ?? "text" });
    await context.assertOwned();
    try { return snapshot.outputMode === "list" ? parseAssistantList(text, row.id) : { text }; }
    catch (error) {
      throw new AssistantQueueFailure({ code: error instanceof AssistantListInvalidError ? error.code : "ASSISTANT_FAILED",
        phase: "result.validate", disposition: "terminal", executionStopped: true });
    }
  },
  async settleTx(tx, job, lease, value) {
    await settleAssistantExecution(job.executionId, lease, value as { text: string; items?: AssistantItem[] }, tx);
    return "succeeded";
  },
  async failTx(tx, job, failure) {
    await tx.assistantExecution.updateMany({
      where: { id: job.executionId, status: { in: ["pending", "processing"] } },
      data: { status: job.cancelRequestedAt ? "cancelled" : "failed", errorCode: failure.code,
        finishedAt: new Date(), executionLeaseToken: null, executionLeaseUntil: null },
    });
  },
  classifyFailure(error) {
    if (error instanceof AssistantQueueFailure) return error.failure;
    return { code: error instanceof AssistantProviderError ? error.code : "ASSISTANT_FAILED",
      phase: "execute", disposition: "reconciliation", executionStopped: false };
  },
};
