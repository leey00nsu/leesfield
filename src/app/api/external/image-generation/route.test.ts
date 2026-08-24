import { NextResponse } from "next/server";
import { imageGenerationDefaults } from "@/features/image-generation/model/image-generation-schema";
import { POST } from "@/app/api/external/image-generation/route";

const mockRequireApiKey = vi.hoisted(() => vi.fn());
const mockSubmitImageGeneration = vi.hoisted(() => vi.fn());
const mockValidatePayload = vi.hoisted(() => vi.fn());
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

vi.mock("@/server/auth/api-key-guard", () => ({
  requireApiKey: mockRequireApiKey,
}));

vi.mock("@/server/image-generation/image-generation-submission", () => ({
  submitImageGeneration: mockSubmitImageGeneration,
}));

vi.mock("@/server/model-catalog/generation-validation", () => ({
  validateImageGenerationPayload: mockValidatePayload,
}));

describe("POST /api/external/image-generation", () => {
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireApiKey.mockReset();
    mockSubmitImageGeneration.mockReset();
    mockValidatePayload.mockReset();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("API 키가 없으면 인증 응답을 그대로 반환한다", async () => {
    mockRequireApiKey.mockResolvedValue(
      NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 }),
    );

    const response = await POST(
      new Request("http://localhost/api/external/image-generation", {
        method: "POST",
        body: new FormData(),
      }),
    );
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
      new Request("http://localhost/api/external/image-generation", {
        method: "POST",
        body: formData,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.message).toBe("INVALID_REQUEST");
  });

  it("정상 요청이면 API key context로 생성 정보를 제출한다", async () => {
    mockRequireApiKey.mockResolvedValue({
      ownerEmail: "api@example.com",
      apiKeyId: "key-id",
    });
    const validatedPayload = {
      ...imageGenerationDefaults,
      prompt: "hello",
    };
    mockValidatePayload.mockResolvedValue({
      success: true,
      data: validatedPayload,
    });
    mockSubmitImageGeneration.mockResolvedValue({
      record: { id: "request-id", status: "pending", progress: 0 },
    });

    const formData = new FormData();
    formData.set("prompt", "hello");
    formData.set("model", imageGenerationDefaults.model);

    const response = await POST(
      new Request("http://localhost/api/external/image-generation", {
        method: "POST",
        body: formData,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      requestId: "request-id",
      status: "pending",
      progress: 0,
    });
    expect(mockSubmitImageGeneration).toHaveBeenCalledWith({
      payload: validatedPayload,
      ownerEmail: "api@example.com",
      apiKeyId: "key-id",
    });
  });

  it("입력 이미지 저장소 오류를 기존 400 code로 변환한다", async () => {
    mockRequireApiKey.mockResolvedValue({
      ownerEmail: "api@example.com",
      apiKeyId: "key-id",
    });
    mockValidatePayload.mockResolvedValue({
      success: true,
      data: {
        ...imageGenerationDefaults,
        prompt: "hello",
        initImages: ["data:image/png;base64,AAAA"],
      },
    });
    mockSubmitImageGeneration.mockRejectedValue(
      new Error("IMAGE_INPUT_STORAGE_REQUIRED"),
    );

    const formData = new FormData();
    formData.set("prompt", "hello");

    const response = await POST(
      new Request("http://localhost/api/external/image-generation", {
        method: "POST",
        body: formData,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.message).toBe("IMAGE_INPUT_STORAGE_REQUIRED");
  });

  it("저장 실패 시 500을 반환한다", async () => {
    mockRequireApiKey.mockResolvedValue({
      ownerEmail: "api@example.com",
      apiKeyId: "key-id",
    });
    mockValidatePayload.mockResolvedValue({
      success: true,
      data: {
        ...imageGenerationDefaults,
        prompt: "hello",
      },
    });
    mockSubmitImageGeneration.mockRejectedValue(new Error("db fail"));

    const formData = new FormData();
    formData.set("prompt", "hello");

    const response = await POST(
      new Request("http://localhost/api/external/image-generation", {
        method: "POST",
        body: formData,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.message).toBe("DB_SAVE_FAILED");
  });
});
