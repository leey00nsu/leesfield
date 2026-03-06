import { audioGenerationDefaults } from "@/features/audio-generation/model/audio-generation-schema";
import { POST } from "@/app/api/audio-generation/route";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockCreateWithLimit = vi.hoisted(() => vi.fn());
const mockStartWorker = vi.hoisted(() => vi.fn());
const mockValidatePayload = vi.hoisted(() => vi.fn());
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/server/audio-generation/audio-generation-store", () => ({
  createMockAudioGenerationWithLimit: mockCreateWithLimit,
}));

vi.mock("@/server/generation-worker/generation-worker", () => ({
  startGenerationWorker: mockStartWorker,
}));

vi.mock("@/server/model-catalog/generation-validation", () => ({
  validateAudioGenerationPayload: mockValidatePayload,
}));

describe("POST /api/audio-generation", () => {
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetSession.mockReset();
    mockCreateWithLimit.mockReset();
    mockStartWorker.mockReset();
    mockValidatePayload.mockReset();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("로그인하지 않은 경우 401을 반환한다", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });

    const request = new Request("http://localhost/api/audio-generation", {
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
    mockValidatePayload.mockResolvedValue({
      success: false,
      error: { flatten: () => ({}) },
    });

    const request = new Request("http://localhost/api/audio-generation", {
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
    mockValidatePayload.mockResolvedValue({
      success: true,
      data: {
        ...audioGenerationDefaults,
        prompt: "hello",
        model: "qwen-tts",
      },
    });
    mockCreateWithLimit.mockResolvedValue({
      record: { id: "request-id", status: "pending", progress: 0 },
      latest: null,
    });

    const request = new Request("http://localhost/api/audio-generation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...audioGenerationDefaults,
        prompt: "hello",
        model: "qwen-tts",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.requestId).toBe("request-id");
    expect(payload.status).toBe("pending");
    expect(payload.progress).toBe(0);
  });

  it("저장 실패 시 500을 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockValidatePayload.mockResolvedValue({
      success: true,
      data: {
        ...audioGenerationDefaults,
        prompt: "hello",
        model: "qwen-tts",
      },
    });
    mockCreateWithLimit.mockRejectedValue(new Error("db fail"));

    const request = new Request("http://localhost/api/audio-generation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...audioGenerationDefaults,
        prompt: "hello",
        model: "qwen-tts",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.message).toBe("DB_SAVE_FAILED");
  });
});
