import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockGetReadinessSnapshot = vi.hoisted(() => vi.fn());
const mockGetQueueMetrics = vi.hoisted(() => vi.fn());
const mockGetDbPoolSnapshot = vi.hoisted(() => vi.fn());
const mockGetWorkerSupervisorState = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/server/observability/readiness", () => ({
  getReadinessSnapshot: mockGetReadinessSnapshot,
}));

vi.mock("@/server/monitoring/queue-status", () => ({
  getQueueMetrics: mockGetQueueMetrics,
}));

vi.mock("@/server/db/prisma", () => ({
  getDbPoolSnapshot: mockGetDbPoolSnapshot,
}));

vi.mock("@/server/runtime/worker-supervisor", () => ({
  getWorkerSupervisorState: mockGetWorkerSupervisorState,
}));

import { GET as live } from "@/app/api/health/live/route";
import { GET as ready } from "@/app/api/health/ready/route";
import { GET as metrics } from "@/app/api/health/metrics/route";

describe("health endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ isLoggedIn: false, adminEmail: null });
    mockGetReadinessSnapshot.mockResolvedValue({
      ready: true,
      database: "ok",
      workers: "ok",
    });
    mockGetQueueMetrics.mockResolvedValue({
      pending: 2,
      processing: 1,
      oldestPendingAgeSeconds: 7,
      failedCleanup: 0,
    });
    mockGetDbPoolSnapshot.mockReturnValue({ total: 4, idle: 3, active: 1, waiting: 0 });
    mockGetWorkerSupervisorState.mockReturnValue({
      started: true,
      stopping: false,
      generation: { started: true, stopping: false, running: false, inFlight: 0 },
      mediaOperation: { started: true, stopping: false, running: false, inFlight: 0 },
      cleanup: { started: true, stopping: false, running: false, inFlight: 0 },
    });
  });

  it("serves liveness independently and preserves the request ID", async () => {
    const response = await live(new Request("http://localhost/api/health/live", {
      headers: { "x-request-id": "health-1" },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("health-1");
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });

  it("returns 503 when readiness reports a dependency failure", async () => {
    mockGetReadinessSnapshot.mockResolvedValue({
      ready: false,
      database: "failed",
      workers: "ok",
    });

    const response = await ready(new Request("http://localhost/api/health/ready"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "not_ready",
      checks: { database: "failed", workers: "ok" },
    });
  });

  it("protects metrics and exposes bounded operational snapshots to admins", async () => {
    const unauthorized = await metrics(new Request("http://localhost/api/health/metrics"));
    expect(unauthorized.status).toBe(401);

    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    const response = await metrics(new Request("http://localhost/api/health/metrics"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      queue: { pending: 2, processing: 1 },
      databasePool: { total: 4, active: 1, waiting: 0 },
      workers: { started: true },
    });
    expect(JSON.stringify(payload)).not.toContain("admin@example.com");
  });
});
