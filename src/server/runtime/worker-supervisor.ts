import { logSafeError } from "@/server/observability/request-observability";
import { startSharedQueue, stopSharedQueue, getSharedQueueState } from "@/server/job-queue/job-queue-runtime";
import { prisma } from "@/server/db/prisma";

const DEFAULT_DRAIN_TIMEOUT_MS = 25_000;

export type WorkerSupervisorStopOptions = {
  drainTimeoutMs?: number;
  exit?: boolean;
};

type WorkerLifecycle = {
  start(): void | Promise<void>;
  stop(options: { drainTimeoutMs: number }): Promise<void>;
};

export type WorkerSupervisorDependencies = {
  queue: WorkerLifecycle;
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
  queue: { start: startSharedQueue, stop: stopSharedQueue },
  disconnect: () => prisma.$disconnect(),
};

export function createWorkerSupervisor(
  dependencies: WorkerSupervisorDependencies = defaultDependencies,
  runtimeProcess: SupervisorProcess = process,
) {
  let started = false;
  let startPromise: Promise<void> | null = null;
  let stopping = false;
  let stopPromise: Promise<void> | null = null;

  const onSignal = () => {
    void stop({ exit: true }).catch(() => {
      runtimeProcess.exitCode = 1;
      runtimeProcess.exit(1);
    });
  };

  function start(): Promise<void> {
    if (stopping || started) return Promise.resolve();
    if (startPromise) return startPromise;
    runtimeProcess.once("SIGTERM", onSignal);
    runtimeProcess.once("SIGINT", onSignal);
    startPromise = Promise.resolve(dependencies.queue.start()).then(() => { if (!stopping) started = true; });
    return startPromise;
  }

  function stop({
    drainTimeoutMs = DEFAULT_DRAIN_TIMEOUT_MS,
    exit = false,
  }: WorkerSupervisorStopOptions = {}) {
    if (stopPromise) return stopPromise;
    if (!started && !startPromise && !stopping) {
      if (exit) runtimeProcess.exit(0);
      return Promise.resolve();
    }

    started = false;
    stopping = true;
    runtimeProcess.removeListener("SIGTERM", onSignal);
    runtimeProcess.removeListener("SIGINT", onSignal);

    stopPromise = (async () => {
      const workerResults = await Promise.allSettled([dependencies.queue.stop({ drainTimeoutMs })]);
      await startPromise?.catch(() => undefined);
      const disconnectResult = await Promise.allSettled([
        dependencies.disconnect(),
      ]);
      const failure = [...workerResults, ...disconnectResult].find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failure) {
        logSafeError("worker.shutdown.failed",failure.reason,{worker:"supervisor",phase:"worker.shutdown"});
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
      queue: getSharedQueueState(),
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
  return getDefaultSupervisor().start();
}

export function stopWorkerSupervisor(options?: WorkerSupervisorStopOptions) {
  return getDefaultSupervisor().stop(options);
}

export function getWorkerSupervisorState() {
  return getDefaultSupervisor().getState();
}
