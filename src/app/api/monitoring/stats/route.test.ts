import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/monitoring/stats/route";

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
});

describe("/api/monitoring/stats", () => {
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
