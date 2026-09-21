import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/monitoring/stats/route";
import { setRateLimitStoreForTests } from "@/server/rate-limit/limiter";
import { allowAllRateLimitStore } from "@/server/rate-limit/limiter";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockGetMonitoringStats = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/server/monitoring/stats", () => ({
  getMonitoringStats: mockGetMonitoringStats,
}));

afterEach(() => {
  vi.clearAllMocks();
  setRateLimitStoreForTests(allowAllRateLimitStore);
});

describe("/api/monitoring/stats", () => {
  it("예산이 소진되면 429와 Retry-After를 반환한다", async () => {
    setRateLimitStoreForTests({
      consume: async () => -3,
      sweep: async () => 0,
    });
    mockGetSession.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@test" });

    const limited = await GET(
      new Request("http://localhost/api/monitoring/stats"),
    );
    expect(limited.status).toBe(429);
    // Negative values encode the remaining deficit; -3 at 0.5/s is 6 seconds.
    expect(limited.headers.get("Retry-After")).toBe("6");
    expect(await limited.json()).toMatchObject({ message: "RATE_LIMITED" });
    expect(mockGetMonitoringStats).not.toHaveBeenCalled();
  });

  it("인증되지 않으면 401을 반환한다", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });

    const request = new Request("http://localhost/api/monitoring/stats");
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.message).toBe("UNAUTHORIZED");
  });

  it("정상 요청이면 stats를 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockGetMonitoringStats.mockResolvedValue([
      {
        day: "2026-01-01",
        total: 5,
        failed: 0,
        errorRate: 0,
        avgLatencyMs: 100,
        p95LatencyMs: 200,
      },
    ]);

    const request = new Request(
      "http://localhost/api/monitoring/stats?from=2026-01-01&to=2026-01-02",
    );
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
  });
});
