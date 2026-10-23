import { randomUUID } from "node:crypto";
import { logSafeError } from "@/server/observability/request-observability";
import {
  QUEUE_POLL_INTERVAL_MS, QUEUE_HEARTBEAT_MS, QUEUE_DRAIN_TIMEOUT_MS,
  QueueContractError, type QueueJobKind,
} from "./contracts";
import type { QueueHandler } from "./job-queue-handler";
import { claimQueueJob, type ClaimedQueueJob } from "./job-queue-scheduler";
import { assertQueueLease, markQueueExternalStart, recordQueueRemoteEvidence, renewQueueLease } from "./job-queue-lease";
import { settleQueueSuccess, settleQueueFailure } from "./job-queue-settlement";
import { recoverExpiredQueueAttempts } from "./job-queue-recovery";
import { serverLogger, withLogContext } from "@/server/observability/logger";
import { recordWorkerFailure } from "@/server/observability/metrics";

export function createQueueRunner(handlers: readonly QueueHandler[], options: {
  heartbeatMs?: number;
  maintenance?: () => Promise<void>;
} = {}) {
  const registry = new Map<QueueJobKind, QueueHandler>();
  for (const h of handlers) {
    if (registry.has(h.kind)) throw new QueueContractError("QUEUE_HANDLER_DUPLICATE");
    registry.set(h.kind, h);
  }
  const workerId = randomUUID();
  const inFlight = new Map<string, Promise<void>>();
  const controllers = new Map<string, AbortController>();
  let pumpPromise: Promise<number> | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopping = false;
  let stopped: Promise<void> | null = null;
  let lastHeartbeatAt: number | null = null;

  function execute(claimed: ClaimedQueueJob) {
    return withLogContext({ worker: "shared-queue", jobId: claimed.job.id, kind: claimed.job.kind,
      sourceId: claimed.job.sourceId, executionId: claimed.job.executionId, attemptId: claimed.attemptId,
      leaseVersion: claimed.lease.version, runtimeEpoch: claimed.lease.runtimeEpoch }, () => executeOwned(claimed));
  }
  async function executeOwned(claimed: ClaimedQueueJob) {
    const handler = registry.get(claimed.job.kind)!;
    const controller = new AbortController();
    controllers.set(claimed.job.id, controller);
    let renewal: Promise<void> | null = null;
    const heartbeat = setInterval(() => {
      if (renewal || controller.signal.aborted) return;
      renewal = renewQueueLease(claimed.lease).catch(error => {
        controller.abort(error);
      }).finally(() => { renewal = null; });
    }, options.heartbeatMs ?? QUEUE_HEARTBEAT_MS);
    heartbeat.unref?.();
    try {
      await markQueueExternalStart(claimed.lease);
      serverLogger.info("queue.job.started", { phase: "execute" });
      const result = await handler.execute(claimed.job, {
        lease: claimed.lease, signal: controller.signal,
        assertOwned: async () => {
          if (controller.signal.aborted) throw controller.signal.reason;
          await assertQueueLease(claimed.lease);
        },
        recordRemoteEvidence: ref => {
          if (controller.signal.aborted) throw controller.signal.reason;
          return recordQueueRemoteEvidence(claimed.lease, ref);
        },
      });
      if (controller.signal.aborted) throw controller.signal.reason;
      await settleQueueSuccess(claimed.lease, handler, result);
      serverLogger.info("queue.job.settled", { phase: "settle", outcome: "succeeded" });
    } catch (error) {
      try {
        const classified = handler.classifyFailure(error, claimed.job);
        recordWorkerFailure("shared." + claimed.job.kind);
        serverLogger.warn("queue.job.failed", { phase: classified.phase, errorCode: classified.code, outcome: classified.disposition });
        await settleQueueFailure(claimed.lease, handler, classified);
      } catch (settlementError) {
        // Durable phase/lease remains recoverable. Never resubmit the provider.
        logSafeError("queue.settlement.failed", settlementError, { worker: "shared-queue", jobId: claimed.job.id });
      }
    } finally {
      clearInterval(heartbeat);
      controllers.delete(claimed.job.id);
      if (renewal) await renewal;
    }
  }

  function pump(): Promise<number> {
    if (stopping) return Promise.resolve(0);
    if (pumpPromise) return pumpPromise;
    pumpPromise = (async () => {
      await recoverExpiredQueueAttempts(registry);
      await options.maintenance?.();
      let claimedCount = 0;
      while (!stopping && inFlight.size < 12) {
        const claimed = await claimQueueJob(workerId, async (tx, job, lease) => {
          const handler = registry.get(job.kind);
          if (!handler) throw new QueueContractError("QUEUE_HANDLER_UNREGISTERED");
          await handler.prepareTx(tx, job, lease);
        });
        if (!claimed) break;
        claimedCount++;
        const promise = execute(claimed);
        inFlight.set(claimed.job.id, promise);
        void promise.finally(() => {
          if (inFlight.get(claimed.job.id) === promise) inFlight.delete(claimed.job.id);
          if (!stopping) queueMicrotask(() => void pump().catch(report));
        }).catch(report);
      }
      lastHeartbeatAt = Date.now();
      return claimedCount;
    })().finally(() => { pumpPromise = null; });
    return pumpPromise;
  }

  function report(error: unknown) {
    recordWorkerFailure("shared.pass");
    logSafeError("queue.pass.failed", error, { worker: "shared-queue", phase: "queue.pump" });
  }

  function start() {
    if (stopping || timer) return;
    timer = setInterval(() => void pump().catch(report), QUEUE_POLL_INTERVAL_MS);
    timer.unref?.();
    void pump().catch(report);
  }

  function stop({ drainTimeoutMs = QUEUE_DRAIN_TIMEOUT_MS } = {}) {
    if (stopped) return stopped;
    stopping = true;
    if (timer) clearInterval(timer);
    timer = undefined;
    stopped = (async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      const draining = (async () => {
        await pumpPromise?.catch(report);
        await Promise.allSettled([...inFlight.values()]);
      })();
      try {
        await Promise.race([draining, new Promise<void>(resolve => {
          timeout = setTimeout(() => { timedOut = true; resolve(); }, Math.max(0, drainTimeoutMs));
          timeout.unref?.();
        })]);
      } finally {
        if (timeout) clearTimeout(timeout);
        if (timedOut) for (const controller of controllers.values()) controller.abort(new QueueContractError("QUEUE_DRAIN_EXPIRED"));
      }
    })();
    return stopped;
  }

  return {
    start, stop, pump,
    async drain() { await pumpPromise; await Promise.allSettled([...inFlight.values()]); },
    getState() {
      return { started: Boolean(timer), stopping, inFlight: inFlight.size,
        running: Boolean(pumpPromise), lastHeartbeatAt };
    },
  };
}
