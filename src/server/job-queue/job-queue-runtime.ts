import { prisma } from "@/server/db/prisma";
import { logSafeError } from "@/server/observability/request-observability";
import { createQueueRunner } from "./job-queue-runner";
import { generationQueueHandlers } from "./handlers/generation-handler";
import { mediaOperationQueueHandler } from "./handlers/media-operation-handler";
import { assistantQueueHandler } from "./handlers/assistant-handler";
import { createStorageCleanupHandler } from "./handlers/storage-cleanup-handler";
import { sweepQueueMaintenance } from "./job-queue-maintenance";
import { setQueueWakeup } from "./job-queue-wakeup";

export function createSharedQueueRuntime(runner: ReturnType<typeof createQueueRunner>, validate: () => Promise<void>) {
  let initialization: Promise<void> | undefined;
  let schemaReady = false;
  let stopping = false;
  function initialize() {
    if (stopping) return Promise.resolve();
    initialization ??= validate().then(() => { schemaReady = true; }).catch(error => {
      initialization = undefined; schemaReady = false; throw error;
    });
    return initialization;
  }
  return {
    async start() { await initialize(); if (!stopping) runner.start(); },
    async pump(options: { awaitCompletion?: boolean } = {}) {
      if (stopping) return 0;
      await initialize();
      const count = await runner.pump();
      if (options.awaitCompletion !== false) await runner.drain();
      return count;
    },
    async stop(options?: { drainTimeoutMs?: number }) {
      stopping = true;
      await runner.stop(options);
    },
    state() {
      const state = runner.getState();
      return { ...state, stopping, schemaReady,
        lastHeartbeatAt: state.lastHeartbeatAt ? new Date(state.lastHeartbeatAt).toISOString() : null,
        heartbeatAgeSeconds: state.lastHeartbeatAt ? Math.max(0, Math.floor((Date.now() - state.lastHeartbeatAt) / 1000)) : null };
    },
  };
}
type RuntimeGlobal = typeof globalThis & { __leesfieldSharedQueue?: ReturnType<typeof createSharedQueueRuntime> };
function runtime() {
  const shared = globalThis as RuntimeGlobal;
  shared.__leesfieldSharedQueue ??= createSharedQueueRuntime(createQueueRunner([
    ...generationQueueHandlers, mediaOperationQueueHandler, assistantQueueHandler, createStorageCleanupHandler(),
  ], { maintenance: sweepQueueMaintenance }), async () => {
    const state = await prisma.queueRuntime.findUniqueOrThrow({ where: { id: 1 } });
    if (state.epoch < 1 || !["paused", "shared"].includes(state.mode)) throw new Error("QUEUE_RUNTIME_INVALID");
  });
  const active = shared.__leesfieldSharedQueue;
  setQueueWakeup(() => {
    if (active.state().started && !active.state().stopping) void active.pump({ awaitCompletion: false }).catch(report);
  });
  return active;
}
function report(error: unknown) { logSafeError("queue.runtime.failed", error, { worker: "shared-queue", phase: "runtime" }); }
export function startSharedQueue() { return runtime().start(); }
export function startSharedQueueBackground() { void startSharedQueue().catch(report); }
export function stopSharedQueue(options?: { drainTimeoutMs?: number }) { return runtime().stop(options); }
export function processSharedQueueJobs(options?: { awaitCompletion?: boolean }) { return runtime().pump(options); }
export function getSharedQueueState() { return runtime().state(); }
