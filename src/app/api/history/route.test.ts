import { GET } from "@/app/api/history/route";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockGetHistory = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/server/history/handlers/get-history", () => ({
  getHistory: mockGetHistory,
}));

describe("GET /api/history", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetHistory.mockReset();
  });

  it("로그인하지 않은 경우 401을 반환한다", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });

    const request = new Request("http://localhost/api/history");
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.message).toBe("UNAUTHORIZED");
  });

  it("정상 요청이면 히스토리 데이터를 반환한다", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: true });
    mockGetHistory.mockResolvedValue({
      items: [],
      total: 0,
      limit: 24,
      offset: 0,
    });

    const request = new Request(
      "http://localhost/api/history?type=all&sort=date_desc&limit=24&offset=0",
    );
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toEqual([]);
    expect(payload.total).toBe(0);
    expect(payload.limit).toBe(24);
    expect(payload.offset).toBe(0);
  });

  it("서버 오류 시 500을 반환한다", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetSession.mockResolvedValue({ isLoggedIn: true });
    mockGetHistory.mockRejectedValue(new Error("boom"));

    const request = new Request("http://localhost/api/history");
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.message).toBe("INTERNAL_SERVER_ERROR");
    consoleSpy.mockRestore();
  });
});
