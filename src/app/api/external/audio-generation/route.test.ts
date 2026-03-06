import { audioGenerationDefaults } from "@/features/audio-generation/model/audio-generation-schema";
import { POST } from "@/app/api/external/audio-generation/route";
import { NextResponse } from "next/server";

const mockRequireApiKey = vi.hoisted(() => vi.fn());
const mockCreateWithLimit = vi.hoisted(() => vi.fn());
const mockStartWorker = vi.hoisted(() => vi.fn());
const mockValidatePayload = vi.hoisted(() => vi.fn());
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

vi.mock("@/server/auth/api-key-guard", () => ({
  requireApiKey: mockRequireApiKey,
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

describe("POST /api/external/audio-generation", () => {
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireApiKey.mockReset();
    mockCreateWithLimit.mockReset();
    mockStartWorker.mockReset();
    mockValidatePayload.mockReset();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("API 키가 없으면 인증 응답을 그대로 반환한다", async () => {
    mockRequireApiKey.mockResolvedValue(
      NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 }),
    );

    const request = new Request("http://localhost/api/external/audio-generation", {
      method: "POST",
      body: new FormData(),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.message).toBe("UNAUTHORIZED");
  });

  it("유효하지 않은 요청이면 400을 반환한다", async () => {
    mockRequireApiKey.mockResolvedValue({
      ownerEmail: "api@example.com",
      apiKeyId: "key-id",
    });
    mockValidatePayload.mockResolvedValue({
      success: false,
      error: { flatten: () => ({}) },
    });

    const formData = new FormData();
    formData.set("prompt", "");

    const response = await POST(
      new Request("http://localhost/api/external/audio-generation", {
        method: "POST",
        body: formData,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.message).toBe("INVALID_REQUEST");
  });

  it("정상 요청이면 생성 정보를 반환한다", async () => {
    mockRequireApiKey.mockResolvedValue({
      ownerEmail: "api@example.com",
      apiKeyId: "key-id",
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

    const formData = new FormData();
    formData.set("prompt", "hello");
    formData.set("model", "qwen-tts");

    const response = await POST(
      new Request("http://localhost/api/external/audio-generation", {
        method: "POST",
        body: formData,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.requestId).toBe("request-id");
    expect(payload.status).toBe("pending");
    expect(payload.progress).toBe(0);
  });

  it("저장 실패 시 500을 반환한다", async () => {
    mockRequireApiKey.mockResolvedValue({
      ownerEmail: "api@example.com",
      apiKeyId: "key-id",
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

    const formData = new FormData();
    formData.set("prompt", "hello");
    formData.set("model", "qwen-tts");

    const response = await POST(
      new Request("http://localhost/api/external/audio-generation", {
        method: "POST",
        body: formData,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.message).toBe("DB_SAVE_FAILED");
  });
});
