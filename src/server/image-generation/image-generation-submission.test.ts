import { Prisma } from "@prisma/client";

import { imageGenerationDefaults } from "@/features/image-generation/model/image-generation-schema";
import {
  ImageGenerationActiveNodeError,
  submitImageGeneration,
} from "@/server/image-generation/image-generation-submission";

const mockStartWorker = vi.hoisted(() => vi.fn());
const mockCreateRecord = vi.hoisted(() => vi.fn());
const mockUploadInputImages = vi.hoisted(() => vi.fn());

vi.mock("@/server/generation-worker/generation-worker", () => ({
  startGenerationWorker: mockStartWorker,
}));

vi.mock("@/server/image-generation/image-generation-repository", () => ({
  createImageGenerationRecord: mockCreateRecord,
}));

vi.mock("@/server/shared/input-image-uploader", () => ({
  uploadInputImages: mockUploadInputImages,
}));

describe("submitImageGeneration", () => {
  beforeEach(() => {
    mockStartWorker.mockReset();
    mockCreateRecord.mockReset();
    mockUploadInputImages.mockReset();
    mockCreateRecord.mockResolvedValue({
      requestId: "request-id",
      status: "pending",
      progress: 0,
    });
  });

  it("worker를 시작하고 pending Generation을 제출한다", async () => {
    const result = await submitImageGeneration({
      payload: {
        ...imageGenerationDefaults,
        prompt: "hello",
      },
      ownerEmail: "admin@example.com",
    });

    expect(mockStartWorker).toHaveBeenCalledTimes(1);
    expect(mockUploadInputImages).not.toHaveBeenCalled();
    expect(mockCreateRecord).toHaveBeenCalledWith(
      expect.any(String),
      {
        ...imageGenerationDefaults,
        prompt: "hello",
        initImages: [],
      },
      "admin@example.com",
      null,
      null,
    );
    expect(result).toEqual({
      record: { id: "request-id", status: "pending", progress: 0 },
    });
  });

  it("입력 이미지를 정규화하고 업로드된 URL을 저장 payload에 전달한다", async () => {
    mockUploadInputImages.mockResolvedValue([
      "https://storage.example.com/input-a.png",
      "https://storage.example.com/input-b.png",
    ]);

    await submitImageGeneration({
      payload: {
        ...imageGenerationDefaults,
        prompt: "hello",
        initImages: [" data:image/png;base64,AAAA ", "", " https://example.com/b.png "],
      },
      ownerEmail: "admin@example.com",
      apiKeyId: "api-key-id",
    });

    const requestId = mockUploadInputImages.mock.calls[0]?.[0];
    expect(requestId).toEqual(expect.any(String));
    expect(mockUploadInputImages).toHaveBeenCalledWith(requestId, [
      "data:image/png;base64,AAAA",
      "https://example.com/b.png",
    ]);
    expect(mockCreateRecord).toHaveBeenCalledWith(
      requestId,
      expect.objectContaining({
        initImages: [
          "https://storage.example.com/input-a.png",
          "https://storage.example.com/input-b.png",
        ],
      }),
      "admin@example.com",
      "api-key-id",
      null,
    );
    expect(mockStartWorker.mock.invocationCallOrder[0]).toBeLessThan(
      mockUploadInputImages.mock.invocationCallOrder[0],
    );
    expect(mockUploadInputImages.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateRecord.mock.invocationCallOrder[0],
    );
  });

  it("입력 이미지 업로드 오류를 그대로 전달한다", async () => {
    const error = new Error("IMAGE_INPUT_STORAGE_REQUIRED");
    mockUploadInputImages.mockRejectedValue(error);

    await expect(
      submitImageGeneration({
        payload: {
          ...imageGenerationDefaults,
          prompt: "hello",
          initImages: ["data:image/png;base64,AAAA"],
        },
        ownerEmail: "admin@example.com",
      }),
    ).rejects.toBe(error);
    expect(mockCreateRecord).not.toHaveBeenCalled();
  });

  it("repository 오류를 그대로 전달한다", async () => {
    const error = new Error("db fail");
    mockCreateRecord.mockRejectedValue(error);

    await expect(
      submitImageGeneration({
        payload: {
          ...imageGenerationDefaults,
          prompt: "hello",
        },
        ownerEmail: "admin@example.com",
      }),
    ).rejects.toBe(error);
  });

  it("Node 실행 metadata를 Generation create에 전달한다", async () => {
    await submitImageGeneration({
      payload: {
        ...imageGenerationDefaults,
        prompt: "node prompt",
      },
      ownerEmail: "admin@example.com",
      graphNodeId: "node-1",
    });

    expect(mockCreateRecord).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ prompt: "node prompt" }),
      "admin@example.com",
      null,
      "node-1",
    );
  });

  it("Node-linked P2002를 active 실행 충돌로 변환한다", async () => {
    mockCreateRecord.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "6.19.2",
      }),
    );

    await expect(
      submitImageGeneration({
        payload: {
          ...imageGenerationDefaults,
          prompt: "node prompt",
        },
        ownerEmail: "admin@example.com",
        graphNodeId: "node-1",
      }),
    ).rejects.toBeInstanceOf(ImageGenerationActiveNodeError);
  });

  it("Classic P2002는 기존 repository 오류 계약을 유지한다", async () => {
    const error = new Prisma.PrismaClientKnownRequestError("unique", {
      code: "P2002",
      clientVersion: "6.19.2",
    });
    mockCreateRecord.mockRejectedValue(error);

    await expect(
      submitImageGeneration({
        payload: {
          ...imageGenerationDefaults,
          prompt: "classic prompt",
        },
        ownerEmail: "admin@example.com",
      }),
    ).rejects.toBe(error);
  });
});
