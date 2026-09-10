import {
  processAudioJobs,
  processImageJobs,
  processVideoJobs,
} from "@/server/generation-worker/generation-worker";
import { prisma } from "@/server/db/prisma";
import { resolveAudioGenerationResult } from "@/server/audio-generation/audio-generation";
import { resolveImageGenerationResult } from "@/server/image-generation/image-generation";
import { resolveVideoGenerationResult } from "@/server/video-generation/video-generation";
import {
  saveAudioGenerationResult,
  updateAudioGenerationStatus,
} from "@/server/audio-generation/audio-generation-repository";
import {
  saveImageGenerationResult,
  updateImageGenerationStatus,
} from "@/server/image-generation/image-generation-repository";
import {
  saveVideoGenerationResult,
  updateVideoGenerationStatus,
} from "@/server/video-generation/video-generation-repository";
import type {
  RuntimeAudioModel,
  RuntimeImageModel,
  RuntimeVideoModel,
} from "@/server/model-catalog/runtime-models";

const mockValidateAudioPayload = vi.hoisted(() => vi.fn());
const mockValidateImagePayload = vi.hoisted(() => vi.fn());
const mockValidateVideoPayload = vi.hoisted(() => vi.fn());
const mockGetRuntimeCatalog = vi.hoisted(() => vi.fn());
const mockGetMediaAsset = vi.hoisted(() => vi.fn());
const mockMarkUploading = vi.hoisted(() => vi.fn());
const mockCompleteGeneration = vi.hoisted(() => vi.fn());
const mockSettleCancelled = vi.hoisted(() => vi.fn());

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    audioGeneration: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    imageGeneration: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    videoGeneration: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/server/audio-generation/audio-generation", () => ({
  resolveAudioGenerationResult: vi.fn(),
}));

vi.mock("@/server/image-generation/image-generation", () => ({
  resolveImageGenerationResult: vi.fn(),
}));

vi.mock("@/server/video-generation/video-generation", () => ({
  resolveVideoGenerationResult: vi.fn(),
}));

vi.mock("@/server/audio-generation/audio-generation-repository", () => ({
  saveAudioGenerationResult: vi.fn(),
  updateAudioGenerationStatus: vi.fn(),
}));

vi.mock("@/server/image-generation/image-generation-repository", () => ({
  saveImageGenerationResult: vi.fn(),
  updateImageGenerationStatus: vi.fn(),
}));

vi.mock("@/server/video-generation/video-generation-repository", () => ({
  saveVideoGenerationResult: vi.fn(),
  updateVideoGenerationStatus: vi.fn(),
}));

vi.mock("@/server/model-catalog/runtime-models", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/model-catalog/runtime-models")
  >("@/server/model-catalog/runtime-models");
  return {
    ...actual,
    getRuntimeCatalog: mockGetRuntimeCatalog,
  };
});

vi.mock("@/server/model-catalog/generation-validation", () => ({
  validateAudioGenerationPayload: mockValidateAudioPayload,
  validateImageGenerationPayload: mockValidateImagePayload,
  validateVideoGenerationPayload: mockValidateVideoPayload,
}));

vi.mock("@/server/media-assets/media-asset-service", () => ({
  mediaAssetService: { get: mockGetMediaAsset },
}));

vi.mock("@/server/node-executions/node-execution-repository", () => ({
  nodeExecutionRepository: {
    markUploading: mockMarkUploading,
    completeGeneration: mockCompleteGeneration,
    settleCancelledIfRequested: mockSettleCancelled,
  },
}));

describe("generation worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkUploading.mockResolvedValue(undefined);
    mockCompleteGeneration.mockResolvedValue({ status: "completed", assetIds: ["asset-output"] });
    mockSettleCancelled.mockResolvedValue(false);
    const audioModels: RuntimeAudioModel[] = [
      {
        key: "alloy-tts",
        isActive: true,
        isDefault: true,
        defaults: {
          voice: "alloy",
          speed: 1,
        },
        concurrentLimit: 1,
        supportsInputAudio: false,
      },
      {
        key: "qwen-tts",
        isActive: true,
        isDefault: false,
        defaults: {
          voice: "alloy",
          speed: 1,
        },
        parameters: {
          prompt: { ui: "textarea", required: true },
          inputAudio: { ui: "upload" },
          referenceText: { ui: "textarea" },
          modeChoice: {
            ui: "select",
            options: ["voice_clone", "custom", "voice_design"],
          },
          language: {
            ui: "select",
            options: ["English", "Korean"],
          },
          speaker: {
            ui: "select",
            options: ["Vivian", "Serena"],
          },
          streamMode: { ui: "toggle" },
          referencePreset: {
            ui: "select",
            options: ["ref_audio_3"],
          },
          xvecOnly: { ui: "toggle" },
          chunkSize: { ui: "range", min: 1, max: 24, step: 1 },
          temperature: { ui: "range", min: 0.1, max: 2, step: 0.05 },
          topK: { ui: "range", min: 1, max: 100, step: 1 },
          repetitionPenalty: {
            ui: "range",
            min: 1,
            max: 1.5,
            step: 0.01,
          },
          customInstruction: { ui: "textarea" },
          voiceInstruction: { ui: "textarea" },
          "hf:model_size": {
            ui: "select",
            binding: {
              source: "hf_space",
              parameterName: "model_size",
              valueType: "string",
              order: 20,
            },
          },
          "hf:use_xvector_only": {
            ui: "toggle",
            binding: {
              source: "hf_space",
              parameterName: "use_xvector_only",
              valueType: "boolean",
              order: 21,
            },
          },
        },
        concurrentLimit: 1,
        supportsInputAudio: true,
      },
    ];
    const imageModels: RuntimeImageModel[] = [
      {
        key: "z-image-turbo",
        isActive: true,
        isDefault: true,
        defaults: {
          steps: 5,
          width: 512,
          height: 512,
          guidanceScale: 1,
          modeChoice: "Distilled (4 steps)",
          promptUpsampling: false,
        },
        concurrentLimit: 1,
        maxInputImages: 0,
      },
    ];
    const videoModels: RuntimeVideoModel[] = [
      {
        key: "wan2-2-hf",
        isActive: true,
        isDefault: true,
        defaults: {
          steps: 6,
          guidanceScale: 1,
          durationSec: 3.5,
          fps: 16,
          aspectRatio: "16:9",
          resolution: 720,
        },
        concurrentLimit: 1,
        supportsInitImage: true,
      },
    ];
    mockGetRuntimeCatalog.mockResolvedValue({
      audioModels,
      imageModels,
      videoModels,
    });
    mockValidateAudioPayload.mockImplementation(async (payload) => ({
      success: true,
      data: payload,
    }));
    mockValidateImagePayload.mockImplementation(async (payload) => ({
      success: true,
      data: payload,
    }));
    mockValidateVideoPayload.mockImplementation(async (payload) => ({
      success: true,
      data: payload,
    }));
  });

  it("processAudioJobs uses modelKey for concurrent-limit accounting", async () => {
    const processingRecord = {
      requestParams: {},
      modelKey: "qwen-tts",
    };
    const pendingRecord = {
      id: "aud-pending-id",
      requestId: "aud-request-id",
      prompt: "hello",
      progress: 0,
      requestParams: {},
      modelKey: "alloy-tts",
    };

    (prisma.audioGeneration.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([processingRecord])
      .mockResolvedValueOnce([pendingRecord]);
    (prisma.audioGeneration.updateMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValue({ count: 1 });
    (resolveAudioGenerationResult as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "completed",
      result: { audios: [] },
      errorMessage: undefined,
      skipDbSave: true,
    });

    await processAudioJobs();

    expect(prisma.audioGeneration.updateMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: { id: "aud-pending-id", status: "pending" },
        data: { status: "processing", progress: 92 },
      }),
    );
    expect(resolveAudioGenerationResult).toHaveBeenCalledWith(
      expect.objectContaining({ model: "alloy-tts" }),
      "aud-request-id",
    );
  });

  it("processAudioJobs persists inline audio result even when storage upload is skipped", async () => {
    const mockRecord = {
      id: "aud-db-id",
      requestId: "aud-request-id",
      prompt: "hello",
      progress: 0,
      requestParams: {
        model: "qwen-tts",
        voice: "alloy",
        speed: 1,
        seed: "",
      },
    };

    (prisma.audioGeneration.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mockRecord]);
    (prisma.audioGeneration.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    (resolveAudioGenerationResult as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "completed",
      result: {
        audios: [
          {
            url: "data:audio/mpeg;base64,ZmFrZQ==",
            durationSec: 2.5,
          },
        ],
      },
      errorMessage: "오디오 저장소가 지정되지 않아 외부 저장소 업로드를 건너뛰고 inline 결과를 사용합니다.",
      skipDbSave: true,
    });

    await processAudioJobs();

    expect(saveAudioGenerationResult).toHaveBeenCalledWith(
      "aud-db-id",
      "completed",
      100,
      {
        audios: [
          {
            url: "data:audio/mpeg;base64,ZmFrZQ==",
            durationSec: 2.5,
          },
        ],
      },
      "오디오 저장소가 지정되지 않아 외부 저장소 업로드를 건너뛰고 inline 결과를 사용합니다.",
    );
    expect(updateAudioGenerationStatus).not.toHaveBeenCalled();
  });

  it("processAudioJobs preserves mode-based audio params and does not re-inject legacy voice defaults", async () => {
    const mockRecord = {
      id: "aud-mode-db-id",
      requestId: "aud-mode-request-id",
      prompt: "hello qwen",
      progress: 0,
      requestParams: {
        model: "qwen-tts",
        speed: 1,
        seed: "",
        inputAudio: "data:audio/wav;base64,UklGRg==",
        referenceText: "reference transcript",
        modeChoice: "voice_clone",
        language: "English",
        speaker: "Vivian",
        streamMode: false,
        referencePreset: "ref_audio_3",
        xvecOnly: true,
        chunkSize: 8,
        temperature: 0.9,
        topK: 50,
        repetitionPenalty: 1.05,
        dynamicParams: {
          "hf:model_size": "1.7B",
          "hf:use_xvector_only": true,
        },
      },
    };

    (prisma.audioGeneration.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mockRecord]);
    (prisma.audioGeneration.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    (resolveAudioGenerationResult as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "completed",
      result: { audios: [] },
      errorMessage: undefined,
      skipDbSave: true,
    });

    await processAudioJobs();

    expect(resolveAudioGenerationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "qwen-tts",
        voice: "",
        modeChoice: "voice_clone",
        language: "English",
        speaker: "Vivian",
        streamMode: false,
        referencePreset: "ref_audio_3",
        xvecOnly: true,
        chunkSize: 8,
        temperature: 0.9,
        topK: 50,
        repetitionPenalty: 1.05,
        dynamicParams: {
          "hf:model_size": "1.7B",
          "hf:use_xvector_only": true,
        },
      }),
      "aud-mode-request-id",
    );
  });

  it.each(["image", "video", "audio"] as const)("replays mapped %s settings without common defaults", async media => {
    const runtime = await mockGetRuntimeCatalog();
    const model = runtime[media + "Models"][0];
    model.mapped = true;
    // Deliberately retain stale legacy defaults to prove the mapped branch ignores them.
    const record = { id: "mapped-id", requestId: "mapped-request", prompt: "edit", requestParams: { model: model.key, dynamicParams: { duration: 0, enabled: false, text: "", options: null } }, imageCount: null, steps: null, seed: null, progress: 0 };
    const table = prisma[media === "image" ? "imageGeneration" : media === "video" ? "videoGeneration" : "audioGeneration"];
    vi.mocked(table.findMany).mockResolvedValueOnce([]).mockResolvedValueOnce([record] as never);
    vi.mocked(table.updateMany).mockResolvedValue({ count: 1 });
    const run = media === "image" ? processImageJobs : media === "video" ? processVideoJobs : processAudioJobs;
    const resolve = media === "image" ? resolveImageGenerationResult : media === "video" ? resolveVideoGenerationResult : resolveAudioGenerationResult;
    vi.mocked(resolve).mockResolvedValue({ status: "completed", skipDbSave: true } as never);
    await run();
    const submitted = vi.mocked(resolve).mock.calls.at(-1)?.[0];
    expect(submitted).toMatchObject({ model: model.key, dynamicParams: record.requestParams.dynamicParams });
    for (const key of ["width", "height", "steps", "imageCount", "durationSec", "fps", "aspectRatio", "resolution", "voice", "speed"]) expect(submitted).not.toHaveProperty(key);
  });

  it.each([false,true])("processImageJobs completes old and versioned snapshots (%s)", async (versioned) => {
    const mockRecord = {
      id: "img-db-id",
      requestId: "img-request-id",
      prompt: "hello",
      requestParams: {
        model: "z-image-turbo",
        width: 512,
        height: 512,
        steps: 5,
        imageCount: 1,
        seed: "",
      },
      imageCount: 1,
      steps: 5,
      seed: null,
      progress: 0,
    };

    if (versioned) mockRecord.requestParams = {requestVersion:2,model:'z-image-turbo',dynamicParams:{width:512,height:512,steps:5,imageCount:1,seed:''},parameterDefinitions:['width','height','steps','imageCount','seed'].map(key=>({key,inputKey:key,target:'top'}))} as unknown as typeof mockRecord.requestParams;

    (prisma.imageGeneration.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mockRecord]);
    (prisma.imageGeneration.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    (resolveImageGenerationResult as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "completed",
      result: { images: [] },
      errorMessage: undefined,
      skipDbSave: true,
    });

    await processImageJobs();

    expect(mockValidateImagePayload.mock.calls.at(-1)?.[0]).toMatchObject({width:512,height:512,steps:5});
    expect(updateImageGenerationStatus).toHaveBeenCalledWith(
      "img-db-id",
      "completed",
      100,
      undefined,
    );
    expect(saveImageGenerationResult).not.toHaveBeenCalled();
  });

  it("resolves stable input asset IDs at processing time and atomically commits Graph outputs", async () => {
    const mockRecord = {
      id: "img-graph-db-id",
      requestId: "img-graph-request-id",
      ownerEmail: "owner@example.com",
      graphNodeId: "node-1",
      prompt: "hello",
      requestParams: {
        dynamicParams: { first_frame: null, references: ["https://example.com/a.png"], options: { count: 2 } },
        model: "z-image-turbo",
        width: 512,
        height: 512,
        steps: 5,
        imageCount: 1,
        seed: "",
        initImages: [],
        inputAssets: [{ assetId: "asset-input", portId: "primary", sortOrder: 0 }],
      },
      imageCount: 1,
      steps: 5,
      seed: null,
      progress: 0,
    };
    (prisma.imageGeneration.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mockRecord]);
    (prisma.imageGeneration.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    mockGetMediaAsset.mockResolvedValue({ url: "https://signed.example/input.png" });
    (resolveImageGenerationResult as ReturnType<typeof vi.fn>).mockImplementation(
      async (_payload, _requestId, lifecycle) => {
        await lifecycle.onUploading();
        return {
          status: "completed",
          result: { images: [{ url: "https://cdn.example.com/output.webp", width: 512, height: 512 }] },
          artifacts: [{
            type: "image",
            storageProvider: "leemage",
            storageObjectId: "file-output",
            storageUrl: "https://cdn.example.com/output.webp",
            mimeType: "image/webp",
            bytes: 128,
            width: 512,
            height: 512,
            durationMs: null,
          }],
        };
      },
    );

    await processImageJobs();

    expect(mockGetMediaAsset).toHaveBeenCalledWith("owner@example.com", "asset-input");
    expect(mockValidateImagePayload).toHaveBeenCalledWith(expect.objectContaining({
      dynamicParams: { first_frame: null, references: ["https://example.com/a.png"], options: { count: 2 } },
      initImages: ["https://signed.example/input.png"],
    }));
    expect(mockMarkUploading).toHaveBeenCalledWith("image", "img-graph-db-id");
    expect(mockCompleteGeneration).toHaveBeenCalledWith(
      "image",
      "img-graph-db-id",
      [expect.objectContaining({ storageObjectId: "file-output" })],
    );
    expect(saveImageGenerationResult).not.toHaveBeenCalled();
  });

  it("treats a deleted claimed Image Generation as a canceled job", async () => {
    const mockRecord = {
      id: "deleted-image-id",
      requestId: "deleted-image-request-id",
      prompt: "hello",
      requestParams: {
        model: "z-image-turbo",
        width: 512,
        height: 512,
        steps: 5,
        imageCount: 1,
        seed: "",
      },
      imageCount: 1,
      steps: 5,
      seed: null,
      progress: 0,
    };

    (prisma.imageGeneration.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mockRecord]);
    (prisma.imageGeneration.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    (resolveImageGenerationResult as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "completed",
      result: { images: [] },
      errorMessage: undefined,
      skipDbSave: true,
    });
    (updateImageGenerationStatus as ReturnType<typeof vi.fn>).mockRejectedValue({
      code: "P2025",
    });

    await expect(processImageJobs()).resolves.toBeUndefined();
    expect(updateImageGenerationStatus).toHaveBeenCalledWith(
      "deleted-image-id",
      "completed",
      100,
      undefined,
    );
  });

  it("processVideoJobs updates status when completed with skipDbSave", async () => {
    const mockRecord = {
      id: "vid-db-id",
      requestId: "vid-request-id",
      prompt: "hello",
      progress: 0,
      requestParams: {
        model: "wan2-2-hf",
        initImage: "data:image/png;base64,AAAA",
        aspectRatio: "16:9",
        resolution: 720,
        durationSec: 3.5,
        fps: 16,
        steps: 6,
        guidanceScale: 1,
        seed: "",
      },
    };

    (prisma.videoGeneration.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mockRecord]);
    (prisma.videoGeneration.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    (resolveVideoGenerationResult as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "completed",
      result: { videos: [] },
      errorMessage: undefined,
      skipDbSave: true,
    });

    await processVideoJobs();

    expect(updateVideoGenerationStatus).toHaveBeenCalledWith(
      "vid-db-id",
      "completed",
      100,
      undefined,
    );
    expect(saveVideoGenerationResult).not.toHaveBeenCalled();
  });

  it("converges stale cancelled uploads and stale non-cancelled work to distinct terminals", async () => {
    (prisma.imageGeneration.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (prisma.imageGeneration.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });

    await processImageJobs();

    expect(prisma.imageGeneration.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        status: { in: ["processing", "uploading"] },
        cancelRequestedAt: { not: null },
        updatedAt: { lt: expect.any(Date) },
      },
      data: { status: "cancelled", progress: 0 },
    });
    expect(prisma.imageGeneration.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        status: { in: ["processing", "uploading"] },
        cancelRequestedAt: null,
        updatedAt: { lt: expect.any(Date) },
      },
      data: { status: "failed", progress: 0, errorMessage: "PROCESSING_TIMEOUT" },
    });
  });
});
