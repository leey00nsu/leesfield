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

describe("generation worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      .mockResolvedValueOnce({ count: 1 });
    (resolveAudioGenerationResult as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "completed",
      result: { audios: [] },
      errorMessage: undefined,
      skipDbSave: true,
    });

    await processAudioJobs();

    expect(prisma.audioGeneration.updateMany).toHaveBeenNthCalledWith(
      2,
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

  it("processImageJobs updates status when completed with skipDbSave", async () => {
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

    expect(updateImageGenerationStatus).toHaveBeenCalledWith(
      "img-db-id",
      "completed",
      100,
      undefined,
    );
    expect(saveImageGenerationResult).not.toHaveBeenCalled();
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
});
