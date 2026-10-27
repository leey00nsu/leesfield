// @vitest-environment node
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
    queue: { schemaReady: true, heartbeatAgeSeconds: 0, started: true, stopping: false, running: false, inFlight: 0 },
  };
}

describe("readiness", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockQueryRaw.mockReset();
    mockWorkerState.mockReset();
    mockQueryRaw.mockResolvedValue([{ mode: "shared", migrationVerified: true }]);
    mockWorkerState.mockReturnValue(healthyWorkerState());
  });

  it("is ready when the database and all workers are available", async () => {
    await expect(getReadinessSnapshot()).resolves.toEqual({
      ready: true,
      database: "ok",
      queue: "shared",
      workers: "ok",
    });
  });

  it("keeps paused deployments unready even when the registry is alive", async () => {
    mockQueryRaw.mockResolvedValue([{ mode: "paused", migrationVerified: false }]);
    expect(await getReadinessSnapshot()).toMatchObject({ ready: false, database: "ok", workers: "ok", queue: "paused" });
  });

  it("reports a database failure without hiding worker state", async () => {
    mockQueryRaw.mockRejectedValue(new Error("database down"));

    await expect(getReadinessSnapshot()).resolves.toEqual({
      ready: false,
      database: "failed",
      queue: "unavailable",
      workers: "ok",
    });
  });

  it("marks a started worker with a stale heartbeat as not ready", async () => {
    mockWorkerState.mockReturnValue({
      ...healthyWorkerState(),
      queue: {
        ...healthyWorkerState().queue,
        heartbeatAgeSeconds: 11,
      },
    });

    await expect(getReadinessSnapshot()).resolves.toEqual({
      ready: false,
      database: "ok",
      queue: "shared",
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
      queue: "unavailable",
      workers: "stopping",
    });
    vi.useRealTimers();
  });
});
