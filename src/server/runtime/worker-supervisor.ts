import {
  GENERATION_WORKER_DRAIN_TIMEOUT_MS,
  getGenerationWorkerState,
  startGenerationWorker,
  stopGenerationWorker,
} from "@/server/generation-worker/generation-worker";
import {
  getMediaOperationWorkerState,
  MEDIA_OPERATION_WORKER_DRAIN_TIMEOUT_MS,
  startMediaOperationWorker,
  stopMediaOperationWorker,
} from "@/server/media-operations/media-operation-worker";
import { prisma } from "@/server/db/prisma";
import {
  getMediaCleanupWorkerState,
  MEDIA_CLEANUP_WORKER_DRAIN_TIMEOUT_MS,
  startMediaCleanupWorker,
  stopMediaCleanupWorker,
} from "@/server/media-assets/media-cleanup-worker";

const DEFAULT_DRAIN_TIMEOUT_MS = Math.max(
  GENERATION_WORKER_DRAIN_TIMEOUT_MS,
  MEDIA_OPERATION_WORKER_DRAIN_TIMEOUT_MS,
  MEDIA_CLEANUP_WORKER_DRAIN_TIMEOUT_MS,
);

export type WorkerSupervisorStopOptions = {
  drainTimeoutMs?: number;
  exit?: boolean;
};

type WorkerLifecycle = {
  start(): void;
  stop(options: { drainTimeoutMs: number }): Promise<void>;
};

export type WorkerSupervisorDependencies = {
  generation: WorkerLifecycle;
  mediaOperation: WorkerLifecycle;
  cleanup?: WorkerLifecycle;
  disconnect(): Promise<void>;
};

type SupervisorProcess = {
  once(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown;
  removeListener(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown;
  exitCode?: string | number;
  exit(code?: number): never;
};

type WorkerSupervisor = ReturnType<typeof createWorkerSupervisor>;
type SupervisorGlobal = typeof globalThis & {
  __leesfieldWorkerSupervisor?: WorkerSupervisor;
};

const defaultDependencies: WorkerSupervisorDependencies = {
  generation: {
    start: startGenerationWorker,
    stop: stopGenerationWorker,
  },
  mediaOperation: {
    start: startMediaOperationWorker,
    stop: stopMediaOperationWorker,
  },
  cleanup: {
    start: startMediaCleanupWorker,
    stop: stopMediaCleanupWorker,
  },
  disconnect: () => prisma.$disconnect(),
};

export function createWorkerSupervisor(
  dependencies: WorkerSupervisorDependencies = defaultDependencies,
  runtimeProcess: SupervisorProcess = process,
) {
  let started = false;
  let stopping = false;
  let stopPromise: Promise<void> | null = null;

  const onSignal = () => {
    void stop({ exit: true }).catch(() => {
      runtimeProcess.exitCode = 1;
      runtimeProcess.exit(1);
    });
  };

  function start() {
    if (started || stopping) return;
    dependencies.generation.start();
    dependencies.mediaOperation.start();
    dependencies.cleanup?.start();
    runtimeProcess.once("SIGTERM", onSignal);
    runtimeProcess.once("SIGINT", onSignal);
    started = true;
  }

  function stop({
    drainTimeoutMs = DEFAULT_DRAIN_TIMEOUT_MS,
    exit = false,
  }: WorkerSupervisorStopOptions = {}) {
    if (stopPromise) return stopPromise;
    if (!started && !stopping) {
      if (exit) runtimeProcess.exit(0);
      return Promise.resolve();
    }

    started = false;
    stopping = true;
    runtimeProcess.removeListener("SIGTERM", onSignal);
    runtimeProcess.removeListener("SIGINT", onSignal);

    stopPromise = (async () => {
      const workerResults = await Promise.allSettled([
        dependencies.generation.stop({ drainTimeoutMs }),
        dependencies.mediaOperation.stop({ drainTimeoutMs }),
        ...(dependencies.cleanup ? [dependencies.cleanup.stop({ drainTimeoutMs })] : []),
      ]);
      const disconnectResult = await Promise.allSettled([
        dependencies.disconnect(),
      ]);
      const failure = [...workerResults, ...disconnectResult].find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failure) {
        runtimeProcess.exitCode = 1;
        if (exit) runtimeProcess.exit(1);
        throw failure.reason;
      }
      if (exit) runtimeProcess.exit(0);
    })();
    return stopPromise;
  }

  function getState() {
    return {
      started,
      stopping,
      generation: getGenerationWorkerState(),
      mediaOperation: getMediaOperationWorkerState(),
      cleanup: getMediaCleanupWorkerState(),
    };
  }

  return { start, stop, getState };
}

function getDefaultSupervisor() {
  const globalForSupervisor = globalThis as SupervisorGlobal;
  globalForSupervisor.__leesfieldWorkerSupervisor ??= createWorkerSupervisor();
  return globalForSupervisor.__leesfieldWorkerSupervisor;
}

export function startWorkerSupervisor() {
  getDefaultSupervisor().start();
}

export function stopWorkerSupervisor(options?: WorkerSupervisorStopOptions) {
  return getDefaultSupervisor().stop(options);
}

export function getWorkerSupervisorState() {
  return getDefaultSupervisor().getState();
}
