import { GET } from "@/app/api/image-generation/[requestId]/route";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockGetGeneration = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/server/image-generation/image-generation-store", () => ({
  getGeneration: mockGetGeneration,
}));

describe("GET /api/image-generation/[requestId]", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetGeneration.mockReset();
  });

  it("로그인하지 않은 경우 401을 반환한다", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ requestId: "request-id" }),
    });

    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.message).toBe("UNAUTHORIZED");
  });

  it("요청이 없으면 404를 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockGetGeneration.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ requestId: "missing-id" }),
    });

    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.message).toBe("NOT_FOUND");
  });

  it("요청이 존재하면 상태를 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockGetGeneration.mockResolvedValue({
      id: "request-id",
      status: "completed",
      progress: 100,
      result: { images: [{ url: "https://example.com/1.png" }] },
      errorMessage: "warn",
    });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ requestId: "request-id" }),
    });

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.requestId).toBe("request-id");
    expect(payload.status).toBe("completed");
    expect(payload.progress).toBe(100);
    expect(payload.result?.images).toHaveLength(1);
    expect(payload.errorMessage).toBe("warn");
  });
});
