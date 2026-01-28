import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/monitoring/top/route";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockGetMonitoringTop = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/server/monitoring/top", () => ({
  getMonitoringTop: mockGetMonitoringTop,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("/api/monitoring/top", () => {
  it("인증되지 않으면 401을 반환한다", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });

    const request = new Request("http://localhost/api/monitoring/top");
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.message).toBe("UNAUTHORIZED");
  });

  it("정상 요청이면 top을 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockGetMonitoringTop.mockResolvedValue({
      metric: "requests",
      limit: 5,
      models: [],
      apiKeys: [],
    });

    const request = new Request(
      "http://localhost/api/monitoring/top?from=2026-01-01&to=2026-01-02",
    );
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.metric).toBe("requests");
  });
});
