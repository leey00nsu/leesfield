import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createWorkerSupervisor,
  type WorkerSupervisorDependencies,
} from "@/server/runtime/worker-supervisor";

function fakeDependencies() {
  return {
    generation: {
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    },
    mediaOperation: {
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    },
    disconnect: vi.fn().mockResolvedValue(undefined),
  } satisfies WorkerSupervisorDependencies;
}

function fakeProcess() {
  return {
    once: vi.fn(),
    removeListener: vi.fn(),
    exit: vi.fn(),
  };
}

describe("worker supervisor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts both workers once and drains them once", async () => {
    const dependencies = fakeDependencies();
    const runtimeProcess = fakeProcess();
    const supervisor = createWorkerSupervisor(
      dependencies,
      runtimeProcess as never,
    );

    supervisor.start();
    supervisor.start();
    expect(dependencies.generation.start).toHaveBeenCalledTimes(1);
    expect(dependencies.mediaOperation.start).toHaveBeenCalledTimes(1);
    expect(runtimeProcess.once).toHaveBeenCalledTimes(2);

    const firstStop = supervisor.stop({ drainTimeoutMs: 123 });
    const secondStop = supervisor.stop({ drainTimeoutMs: 456 });
    expect(secondStop).toBe(firstStop);
    await firstStop;

    expect(dependencies.generation.stop).toHaveBeenCalledWith({ drainTimeoutMs: 123 });
    expect(dependencies.mediaOperation.stop).toHaveBeenCalledWith({ drainTimeoutMs: 123 });
    expect(dependencies.disconnect).toHaveBeenCalledTimes(1);
    expect(runtimeProcess.removeListener).toHaveBeenCalledTimes(2);
  });

  it("drains before exiting after SIGTERM", async () => {
    const dependencies = fakeDependencies();
    let releaseDrain!: () => void;
    const drain = new Promise<void>((resolve) => {
      releaseDrain = resolve;
    });
    dependencies.generation.stop.mockReturnValueOnce(drain);
    const runtimeProcess = fakeProcess();
    const supervisor = createWorkerSupervisor(
      dependencies,
      runtimeProcess as never,
    );
    supervisor.start();

    const signalHandler = runtimeProcess.once.mock.calls.find(
      ([signal]) => signal === "SIGTERM",
    )?.[1] as (() => void) | undefined;
    expect(signalHandler).toBeDefined();

    signalHandler?.();
    await Promise.resolve();
    expect(runtimeProcess.exit).not.toHaveBeenCalled();

    releaseDrain();
    await vi.waitFor(() => {
      expect(runtimeProcess.exit).toHaveBeenCalledWith(0);
    });
  });
});
