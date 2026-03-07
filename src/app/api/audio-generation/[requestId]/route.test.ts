import { GET } from "@/app/api/audio-generation/[requestId]/route";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockGetAudioGeneration = vi.hoisted(() => vi.fn());
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/server/audio-generation/audio-generation-store", () => ({
  getAudioGeneration: mockGetAudioGeneration,
}));

describe("GET /api/audio-generation/[requestId]", () => {
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetSession.mockReset();
    mockGetAudioGeneration.mockReset();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
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
    mockGetAudioGeneration.mockResolvedValue(null);

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
    mockGetAudioGeneration.mockResolvedValue({
      id: "request-id",
      status: "completed",
      progress: 100,
      result: { audios: [{ url: "https://example.com/1.mp3" }] },
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
    expect(payload.result?.audios).toHaveLength(1);
    expect(payload.errorMessage).toBe("warn");
  });

  it("조회 중 예외가 발생하면 500을 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockGetAudioGeneration.mockRejectedValue(new Error("db fail"));

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ requestId: "request-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.message).toBe("INTERNAL_SERVER_ERROR");
  });
});
