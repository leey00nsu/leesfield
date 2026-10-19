import { z } from "zod";
import { withLogContext } from "@/server/observability/logger";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import { getLlmModelApiKey } from "@/server/model-catalog/model-credential";
import { logSafeError } from "@/server/observability/request-observability";
import { AssistantProviderError, completeAssistant } from "./assistant-provider";
import { prepareAssistantVisuals } from "./assistant-visuals";
import { assistantOutputModeSchema, AssistantListInvalidError, parseAssistantList } from "@/shared/generation-graph/assistant-output";
import {
  AssistantLeaseLostError, claimAssistantExecution, finalizeAssistantCancellation,
  listPendingAssistantIds, renewAssistantLease, settleAssistantExecution,
  type AssistantInputSnapshot,
} from "./assistant-execution-repository";

const snapshotSchema = z.object({
  promptProvenance: z.unknown().optional(),
  instruction: z.string().max(20_000), text: z.string().max(20_000).nullable(),
  outputMode: assistantOutputModeSchema.optional(),
  assets: z.array(z.object({ assetId: z.string(), type: z.enum(["image", "video"]), portId: z.string(), sortOrder: z.number().int() })).max(6),
}).strict();

const inFlight = new Map<string, Promise<void>>();
let interval: ReturnType<typeof setInterval> | undefined;
let stopping = false;

async function handle(id: string) {
  const claimed = await claimAssistantExecution(id);
  if (!claimed) return;
  const { row, lease } = claimed;
  return withLogContext({jobId:id, modelKey:row.modelKey, worker:"assistant", provider:"openai_compatible"}, async () => {
  const controller = new AbortController();
  let lost = false;
  let renewal: Promise<void> | null = null;
  const heartbeat = setInterval(() => {
    if (renewal || lost) return;
    renewal = renewAssistantLease(id, lease).catch((error) => { logSafeError("assistant.lease.failed", error, {jobId:id, modelKey:row.modelKey, worker:"assistant", phase:"lease.renew"}); lost = true; controller.abort(); }).finally(() => { renewal = null; });
  }, 5_000);
  heartbeat.unref?.();
  try {
    const snapshot = snapshotSchema.parse(row.inputSnapshot) as AssistantInputSnapshot;
    const model = (await getModelCatalog({ bypassCache: true })).find((candidate) => candidate.type === "llm" && candidate.key === row.modelKey && candidate.isActive);
    if (!model || model.type !== "llm") throw new AssistantProviderError("ASSISTANT_MODEL_UNAVAILABLE");
    if (snapshot.assets.length && !model.providerConfig.supports_images) throw new AssistantProviderError("ASSISTANT_VISUAL_UNSUPPORTED");
    const visuals = await prepareAssistantVisuals(row.ownerEmail, snapshot, controller.signal);
    const apiKey = await getLlmModelApiKey(row.modelKey);
    const text = await completeAssistant({
      baseUrl: model.providerConfig.base_url, modelId: model.providerConfig.model_id,
      timeoutMs: model.providerConfig.timeout_ms ?? 60_000, apiKey,
      instruction: snapshot.instruction, text: snapshot.text, visuals, signal: controller.signal,
      outputMode: snapshot.outputMode ?? "text",
    });
    if (lost || controller.signal.aborted) throw new AssistantLeaseLostError();
    await settleAssistantExecution(id, lease, snapshot.outputMode === "list" ? parseAssistantList(text, id) : { text });
  } catch (error) {
    if (lost || error instanceof AssistantLeaseLostError) {
      await finalizeAssistantCancellation(id, lease);
      return;
    }
    const code = error instanceof AssistantProviderError || error instanceof AssistantListInvalidError ? error.code : "ASSISTANT_FAILED";
    logSafeError("job.failure", error, { worker: "assistant", jobId: id, modelKey: row.modelKey, errorCode: code, phase: "assistant.execute" });
    await settleAssistantExecution(id, lease, { errorCode: code }).catch((failure) => {
      if (!(failure instanceof AssistantLeaseLostError)) throw failure;
    });
  } finally { clearInterval(heartbeat); }
  });
}

export async function processAssistantJobs({ awaitCompletion = true }: { awaitCompletion?: boolean } = {}) {
  if (stopping) return 0;
  const rows = await listPendingAssistantIds();
  const running = rows.map(({ id }) => {
    const existing = inFlight.get(id);
    if (existing) return existing;
    const promise = handle(id).finally(() => { if (inFlight.get(id) === promise) inFlight.delete(id); });
    inFlight.set(id, promise);
    return promise;
  });
  if (awaitCompletion) await Promise.all(running);
  return running.length;
}

export function startAssistantWorker() {
  if (stopping || interval) return;
  interval = setInterval(() => void processAssistantJobs({ awaitCompletion: false }).catch((error) => {
    logSafeError("worker.pass.failure", error, { worker: "assistant",  });
  }), 2_000);
  interval.unref?.();
  queueMicrotask(() => void processAssistantJobs({ awaitCompletion: false }).catch(error => logSafeError("worker.pass.failure", error, {worker:"assistant",phase:"worker.pass"})));
}

export async function stopAssistantWorker({ drainTimeoutMs = 25_000 }: { drainTimeoutMs?: number } = {}) {
  stopping = true;
  if (interval) clearInterval(interval);
  interval = undefined;
  await Promise.race([
    Promise.allSettled([...inFlight.values()]),
    new Promise<void>((resolve) => { const timer = setTimeout(resolve, drainTimeoutMs); timer.unref?.(); }),
  ]);
}
