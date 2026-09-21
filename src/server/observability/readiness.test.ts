import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQueryRaw = vi.hoisted(() => vi.fn());
const mockWorkerState = vi.hoisted(() => vi.fn());

vi.mock("@/server/db/prisma", () => ({
  prisma: { $queryRaw: mockQueryRaw },
}));

vi.mock("@/server/runtime/worker-supervisor", () => ({
  getWorkerSupervisorState: mockWorkerState,
}));

import {
  getReadinessSnapshot,
  READINESS_TIMEOUT_MS,
} from "@/server/observability/readiness";

function healthyWorkerState() {
  return {
    started: true,
    stopping: false,
    generation: { started: true, stopping: false, running: false, inFlight: 0 },
    mediaOperation: { started: true, stopping: false, running: false, inFlight: 0 },
    cleanup: { started: true, stopping: false, running: false, inFlight: 0 },
  };
}

describe("readiness", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockQueryRaw.mockReset();
    mockWorkerState.mockReset();
    mockQueryRaw.mockResolvedValue([{ ok: 1 }]);
    mockWorkerState.mockReturnValue(healthyWorkerState());
  });

  it("is ready when the database and all workers are available", async () => {
    await expect(getReadinessSnapshot()).resolves.toEqual({
      ready: true,
      database: "ok",
      workers: "ok",
    });
  });

  it("reports a database failure without hiding worker state", async () => {
    mockQueryRaw.mockRejectedValue(new Error("database down"));

    await expect(getReadinessSnapshot()).resolves.toEqual({
      ready: false,
      database: "failed",
      workers: "ok",
    });
  });

  it("marks a started worker with a stale heartbeat as not ready", async () => {
    mockWorkerState.mockReturnValue({
      ...healthyWorkerState(),
      generation: {
        ...healthyWorkerState().generation,
        heartbeatAgeSeconds: 11,
      },
    });

    await expect(getReadinessSnapshot()).resolves.toEqual({
      ready: false,
      database: "ok",
      workers: "not_ready",
    });
  });

  it("times out a hung database check and reports stopping workers", async () => {
    vi.useFakeTimers();
    mockQueryRaw.mockReturnValue(new Promise(() => undefined));
    mockWorkerState.mockReturnValue({
      ...healthyWorkerState(),
      stopping: true,
    });

    const result = getReadinessSnapshot();
    await vi.advanceTimersByTimeAsync(READINESS_TIMEOUT_MS + 1);

    await expect(result).resolves.toEqual({
      ready: false,
      database: "failed",
      workers: "stopping",
    });
    vi.useRealTimers();
  });
});
