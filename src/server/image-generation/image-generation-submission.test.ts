import { Prisma } from "@prisma/client";

import { imageGenerationDefaults } from "@/features/image-generation/model/image-generation-schema";
import {
  ImageGenerationActiveNodeError,
  submitImageGeneration,
} from "@/server/image-generation/image-generation-submission";

const mockStartWorker = vi.hoisted(() => vi.fn());
const mockCreateRecord = vi.hoisted(() => vi.fn());
const mockUploadInputAssets = vi.hoisted(() => vi.fn());
const mockInputMediaForPayload = vi.hoisted(() => vi.fn(
  (_type: string, payload: { initImages?: string[] }) => [] as unknown[],
));
const mockApplyInputAssets = vi.hoisted(() => vi.fn((payload, uploaded) => ({
  ...payload,
  initImages: uploaded.map((item: { url: string }) => item.url),
})));

vi.mock("@/server/generation-worker/generation-worker", () => ({
  startGenerationWorker: mockStartWorker,
}));

vi.mock("@/server/image-generation/image-generation-repository", () => ({
  createImageGenerationRecord: mockCreateRecord,
}));

vi.mock("@/server/shared/input-media-uploader", () => ({
  uploadGenerationInputAssets: mockUploadInputAssets,
  generationInputMediaForPayload: mockInputMediaForPayload,
  applyUploadedGenerationInputAssets: mockApplyInputAssets,
}));

describe("submitImageGeneration", () => {
  beforeEach(() => {
    mockStartWorker.mockReset();
    mockCreateRecord.mockReset();
    mockUploadInputAssets.mockReset();
    mockInputMediaForPayload.mockClear();
    mockApplyInputAssets.mockClear();
    mockInputMediaForPayload.mockImplementation((_type, payload) => payload.initImages?.length
      ? [{ field: "initImages", mediaType: "image", generationType: "image", sources: payload.initImages, multiple: true }]
      : []);
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
    expect(mockUploadInputAssets).not.toHaveBeenCalled();
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
    mockUploadInputAssets.mockResolvedValue([
      { ref: { assetId: "asset-a", field: "initImages", sortOrder: 0, multiple: true, generationType: "image" }, url: "https://storage.example.com/input-a.png" },
      { ref: { assetId: "asset-b", field: "initImages", sortOrder: 1, multiple: true, generationType: "image" }, url: "https://storage.example.com/input-b.png" },
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

    const requestId = mockUploadInputAssets.mock.calls[0]?.[0];
    expect(requestId).toEqual(expect.any(String));
    expect(mockUploadInputAssets).toHaveBeenCalledWith(requestId, "admin@example.com", expect.any(Array));
    expect(mockUploadInputAssets.mock.calls[0]?.[2]).toEqual([
      expect.objectContaining({ field: "initImages", mediaType: "image", generationType: "image", sources: [
        "data:image/png;base64,AAAA",
        "https://example.com/b.png",
      ] }),
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
      undefined,
      [
        expect.objectContaining({ assetId: "asset-a", field: "initImages", sortOrder: 0 }),
        expect.objectContaining({ assetId: "asset-b", field: "initImages", sortOrder: 1 }),
      ],
    );
    expect(mockStartWorker.mock.invocationCallOrder[0]).toBeLessThan(
      mockUploadInputAssets.mock.invocationCallOrder[0],
    );
    expect(mockUploadInputAssets.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateRecord.mock.invocationCallOrder[0],
    );
  });

  it("입력 이미지 업로드 오류를 그대로 전달한다", async () => {
    const error = new Error("IMAGE_INPUT_STORAGE_REQUIRED");
    mockUploadInputAssets.mockRejectedValue(error);

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
