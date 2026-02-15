import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/monitoring/requests/route";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockGetMonitoringRequests = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/server/monitoring/requests", () => ({
  getMonitoringRequests: mockGetMonitoringRequests,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("/api/monitoring/requests", () => {
  it("인증되지 않으면 401을 반환한다", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });

    const request = new Request("http://localhost/api/monitoring/requests");
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.message).toBe("UNAUTHORIZED");
  });

  it("정상 요청이면 requests를 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockGetMonitoringRequests.mockResolvedValue({
      updatedAt: "2026-01-02T00:00:00Z",
      items: [],
      total: 0,
      limit: 10,
      offset: 20,
    });

    const request = new Request(
      "http://localhost/api/monitoring/requests?limit=10&offset=20&from=2026-01-01&to=2026-01-02",
    );
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.updatedAt).toBe("2026-01-02T00:00:00Z");
    expect(payload.limit).toBe(10);
    expect(payload.offset).toBe(20);
    expect(mockGetMonitoringRequests).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 10,
        offset: 20,
      }),
    );
  });

  it("limit/offset이 없으면 기본 페이지네이션 값을 사용한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockGetMonitoringRequests.mockResolvedValue({
      updatedAt: "2026-01-03T00:00:00Z",
      items: [],
      total: 3,
      limit: 50,
      offset: 0,
    });

    const request = new Request(
      "http://localhost/api/monitoring/requests?from=2026-01-01&to=2026-01-02",
    );
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.total).toBe(3);
    expect(payload.limit).toBe(50);
    expect(payload.offset).toBe(0);
    expect(mockGetMonitoringRequests).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 50,
        offset: 0,
      }),
    );
  });
});
