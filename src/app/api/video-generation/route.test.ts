import { videoGenerationDefaults } from "@/features/video-generation/model/video-generation-schema";
import { POST } from "@/app/api/video-generation/route";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockCreateWithLimit = vi.hoisted(() => vi.fn());
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/server/video-generation/video-generation-store", () => ({
  createMockVideoGenerationWithLimit: mockCreateWithLimit,
}));

describe("POST /api/video-generation", () => {
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetSession.mockReset();
    mockCreateWithLimit.mockReset();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("로그인하지 않은 경우 401을 반환한다", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });

    const request = new Request("http://localhost/api/video-generation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.message).toBe("UNAUTHORIZED");
  });

  it("유효하지 않은 요청이면 400을 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });

    const request = new Request("http://localhost/api/video-generation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.message).toBe("INVALID_REQUEST");
  });

  it("정상 요청이면 생성 정보를 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockCreateWithLimit.mockResolvedValue({
      record: { id: "request-id", status: "pending", progress: 0 },
      latest: null,
    });

    const request = new Request("http://localhost/api/video-generation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...videoGenerationDefaults,
        prompt: "hello",
        initImage: "data:image/png;base64,AAAA",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.requestId).toBe("request-id");
    expect(payload.status).toBe("pending");
    expect(payload.progress).toBe(0);
  });

  it("동일 모델 진행 중이면 429를 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockCreateWithLimit.mockResolvedValue({
      record: null,
      latest: { id: "existing-request" },
    });

    const request = new Request("http://localhost/api/video-generation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...videoGenerationDefaults,
        prompt: "hello",
        initImage: "data:image/png;base64,AAAA",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.message).toBe("IN_PROGRESS_ALREADY");
    expect(payload.requestId).toBe("existing-request");
    expect(mockCreateWithLimit).toHaveBeenCalled();
  });

  it("저장 실패 시 500을 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockCreateWithLimit.mockRejectedValue(new Error("db fail"));

    const request = new Request("http://localhost/api/video-generation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...videoGenerationDefaults,
        prompt: "hello",
        initImage: "data:image/png;base64,AAAA",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.message).toBe("INTERNAL_SERVER_ERROR");
  });
});
