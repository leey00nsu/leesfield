import { z } from "zod";
import { hasRuntimeParameterOption } from "@/shared/model-catalog/parameter-options";
import type { AudioGenerationFormValues } from "@/features/audio-generation/model/audio-generation-schema";
import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import type {
  AudioModelCatalogItem,
  ImageModelCatalogItem,
  VideoModelCatalogItem,
} from "@/server/model-catalog/catalog-schema";

type TranslationFn = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: z.ZodError<T> };

type NumericRange = {
  min: number;
  max: number;
  step: number;
};

type ParameterConfig = {
  min?: unknown;
  max?: unknown;
  step?: unknown;
  default?: unknown;
  required?: unknown;
  options?: unknown[];
};

const imageFallbackRanges: Record<
  "size" | "steps" | "count" | "guidance",
  NumericRange
> = {
  size: { min: 1, max: 4096, step: 1 },
  steps: { min: 1, max: 50, step: 1 },
  count: { min: 1, max: 1, step: 1 },
  guidance: { min: 0, max: 10, step: 0.5 },
};

const videoFallbackRanges: Record<
  "duration" | "steps" | "guidance" | "fps",
  NumericRange
> = {
  duration: { min: 0.5, max: 10, step: 0.5 },
  steps: { min: 1, max: 50, step: 1 },
  guidance: { min: 0, max: 20, step: 0.5 },
  fps: { min: 1, max: 60, step: 1 },
};

const audioFallbackRanges: Record<
  "speed" | "chunkSize" | "temperature" | "topK" | "repetitionPenalty",
  NumericRange
> = {
  speed: { min: 0.25, max: 4, step: 0.05 },
  chunkSize: { min: 40, max: 200, step: 10 },
  temperature: { min: 0.1, max: 1.2, step: 0.1 },
  topK: { min: 1, max: 100, step: 1 },
  repetitionPenalty: { min: 1, max: 2, step: 0.1 },
};

const buildInitImageSchema = (t?: TranslationFn) =>
  z
    .string()
    .refine((value) => {
      const trimmed = value.trim();
      if (!trimmed) return true;
      if (trimmed.startsWith("data:")) {
        return /^data:[^;]+;base64,/.test(trimmed);
      }
      if (/^https?:\/\//.test(trimmed)) {
        try {
          const url = new URL(trimmed);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      }
      return false;
    }, t ? t("initImageInvalid") : "initImage는 data URL(base64) 또는 http(s) URL이어야 합니다.")
    .describe("data URL(base64) 또는 http(s) 이미지 URL");

function resolveNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolveRange(
  param: Record<string, unknown> | undefined,
  fallback: NumericRange,
): NumericRange {
  return {
    min: resolveNumber(param?.min, fallback.min),
    max: resolveNumber(param?.max, fallback.max),
    step: resolveNumber(param?.step, fallback.step),
  };
}

function getParamConfig(
  parameters: Record<string, unknown>,
  key: string,
): ParameterConfig | undefined {
  const param = parameters[key];
  return param && typeof param === "object" ? (param as ParameterConfig) : undefined;
}

function buildImageSchema(models: ImageModelCatalogItem[], t?: TranslationFn) {
  const modelMap = new Map(models.map((model) => [model.key, model]));
  const invalidModelMessage = t
    ? t("invalidModel")
    : "지원하지 않는 모델입니다.";
  const promptRequired = t
    ? t("promptRequired")
    : "프롬프트를 입력해주세요.";
  const labelMap = {
    width: t ? t("labels.width") : "너비",
    height: t ? t("labels.height") : "높이",
    steps: t ? t("labels.steps") : "스텝",
    imageCount: t ? t("labels.imageCount") : "이미지 개수",
    guidanceScale: t ? t("labels.guidanceScale") : "가이던스",
  };
  const rangeMessage = (label: string, min: number, max: number) =>
    t ? t("range", { label, min, max }) : `${label}는 ${min}~${max} 범위여야 합니다.`;
  const stepMessage = (label: string, step: number) =>
    t ? t("step", { label, step }) : `${label}는 ${step} 단위로 입력해야 합니다.`;
  const initImageUnsupported = t
    ? t("initImageUnsupported")
    : "선택한 모델은 이미지 입력을 지원하지 않습니다.";
  const maxInputImagesMessage = (limit: number) =>
    t ? t("maxInputImages", { limit }) : `이미지는 최대 ${limit}장까지 업로드할 수 있습니다.`;
  const unsupportedMode = t ? t("unsupportedMode") : "지원하지 않는 모드입니다.";

  const schema = z.object({
    prompt: z.string().min(1, promptRequired),
    width: z.number().int(),
    height: z.number().int(),
    initImages: z.array(z.string()).optional(),
    model: z.string().min(1),
    imageCount: z.number().int(),
    steps: z.number().int(),
    modeChoice: z.string().optional(),
    guidanceScale: z.number().optional(),
    promptUpsampling: z.boolean().optional(),
    seed: z.string().optional().or(z.literal("")),
  });

  return schema.superRefine((data, ctx) => {
    const model = modelMap.get(data.model);
    if (!model) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["model"],
        message: invalidModelMessage,
      });
      return;
    }

    const parameters = (model.parameters ?? {}) as Record<string, unknown>;
    const widthRange = resolveRange(
      getParamConfig(parameters, "width"),
      imageFallbackRanges.size,
    );
    const heightRange = resolveRange(
      getParamConfig(parameters, "height"),
      imageFallbackRanges.size,
    );
    const stepsRange = resolveRange(
      getParamConfig(parameters, "steps"),
      imageFallbackRanges.steps,
    );
    const countRange = resolveRange(
      getParamConfig(parameters, "imageCount"),
      imageFallbackRanges.count,
    );

    const validateRange = (
      value: number,
      range: { min: number; max: number; step: number },
      path: (string | number)[],
      label: string,
    ) => {
      if (value < range.min || value > range.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: rangeMessage(label, range.min, range.max),
        });
        return;
      }
      if (range.step > 0) {
        const offset = value - range.min;
        const quotient = offset / range.step;
        if (Math.abs(quotient - Math.round(quotient)) > 1e-6) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path,
            message: stepMessage(label, range.step),
          });
        }
      }
    };

    validateRange(data.width, widthRange, ["width"], labelMap.width);
    validateRange(data.height, heightRange, ["height"], labelMap.height);
    validateRange(data.steps, stepsRange, ["steps"], labelMap.steps);
    validateRange(
      data.imageCount,
      countRange,
      ["imageCount"],
      labelMap.imageCount,
    );

    if (typeof data.guidanceScale === "number") {
      const guidanceRange = resolveRange(
        getParamConfig(parameters, "guidanceScale"),
        imageFallbackRanges.guidance,
      );
      validateRange(
        data.guidanceScale,
        guidanceRange,
        ["guidanceScale"],
        labelMap.guidanceScale,
      );
    }

    const modeConfig = getParamConfig(parameters, "modeChoice");
    if (
      typeof data.modeChoice === "string" &&
      data.modeChoice.trim() &&
      modeConfig?.options?.length &&
      !hasRuntimeParameterOption(modeConfig.options, data.modeChoice)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["modeChoice"],
        message: unsupportedMode,
      });
    }

    const maxInputImages = resolveNumber(model.meta?.max_input_images, 0);
    const count = data.initImages?.length ?? 0;
    if (count > 0 && maxInputImages === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["initImages"],
        message: initImageUnsupported,
      });
      return;
    }
    if (count > maxInputImages) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["initImages"],
        message: maxInputImagesMessage(maxInputImages),
      });
    }
  });
}

function buildVideoSchema(models: VideoModelCatalogItem[], t?: TranslationFn) {
  const modelMap = new Map(models.map((model) => [model.key, model]));
  const invalidModelMessage = t
    ? t("invalidModel")
    : "지원하지 않는 모델입니다.";
  const promptRequired = t ? t("promptRequired") : "프롬프트를 입력해주세요.";
  const initImageSchema = buildInitImageSchema(t);
  const initImageRequiredMessage = t
    ? t("initImageRequired")
    : "initImage는 필수입니다.";
  const labels = {
    durationSec: t ? t("labels.durationSec") : "재생시간",
    steps: t ? t("labels.steps") : "스텝",
    guidanceScale: t ? t("labels.guidanceScale") : "가이던스",
    fps: t ? t("labels.fps") : "FPS",
  };
  const intOnlyMessage = (label: string) =>
    t ? t("intOnly", { label }) : `${label}는 정수만 허용됩니다.`;
  const rangeMessage = (label: string, min: number, max: number) =>
    t ? t("range", { label, min, max }) : `${label}는 ${min}~${max} 범위여야 합니다.`;
  const stepMessage = (label: string, step: number) =>
    t ? t("step", { label, step }) : `${label}는 ${step} 단위로 입력해야 합니다.`;
  const initImageNeeded = t
    ? t("initImageNeeded")
    : "선택한 모델은 이미지 입력이 필요합니다.";
  const initImageUnsupported = t
    ? t("initImageUnsupported")
    : "선택한 모델은 이미지 입력을 지원하지 않습니다.";
  const unsupportedAspectRatio = t
    ? t("unsupportedAspectRatio")
    : "지원하지 않는 비율입니다.";
  const unsupportedResolution = t
    ? t("unsupportedResolution")
    : "지원하지 않는 해상도입니다.";

  const schema = z.object({
    prompt: z.string().min(1, promptRequired),
    initImage: initImageSchema.optional().or(z.literal("")),
    model: z.string().min(1),
    aspectRatio: z.string().min(1),
    resolution: z.number().int(),
    durationSec: z.number(),
    fps: z.number().int(),
    steps: z.number().int(),
    guidanceScale: z.number(),
    seed: z.string().optional().or(z.literal("")),
  });

  return schema.superRefine((data, ctx) => {
    const model = modelMap.get(data.model);
    if (!model) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["model"],
        message: invalidModelMessage,
      });
      return;
    }

    const supportsInitImage = Boolean(model.meta?.supports_init_image);
    const hasInitImage = Boolean(data.initImage?.trim());
    if (supportsInitImage && !hasInitImage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["initImage"],
        message: initImageNeeded,
      });
    }
    if (hasInitImage && !supportsInitImage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["initImage"],
        message: initImageUnsupported,
      });
    }

    const parameters = (model.parameters ?? {}) as Record<string, unknown>;
    const durationRange = resolveRange(
      getParamConfig(parameters, "durationSec"),
      videoFallbackRanges.duration,
    );
    const stepsRange = resolveRange(
      getParamConfig(parameters, "steps"),
      videoFallbackRanges.steps,
    );
    const guidanceRange = resolveRange(
      getParamConfig(parameters, "guidanceScale"),
      videoFallbackRanges.guidance,
    );
    const fpsRange = resolveRange(
      getParamConfig(parameters, "fps"),
      videoFallbackRanges.fps,
    );

    const validateRange = (
      value: number,
      range: { min: number; max: number; step: number },
      path: (string | number)[],
      label: string,
      allowFloat = false,
    ) => {
      if (!allowFloat && !Number.isInteger(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: intOnlyMessage(label),
        });
        return;
      }
      if (value < range.min || value > range.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: rangeMessage(label, range.min, range.max),
        });
        return;
      }
      if (range.step > 0) {
        const offset = value - range.min;
        const quotient = offset / range.step;
        if (Math.abs(quotient - Math.round(quotient)) > 1e-6) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path,
            message: stepMessage(label, range.step),
          });
        }
      }
    };

    validateRange(data.durationSec, durationRange, ["durationSec"], labels.durationSec, true);
    validateRange(data.steps, stepsRange, ["steps"], labels.steps);
    validateRange(
      data.guidanceScale,
      guidanceRange,
      ["guidanceScale"],
      labels.guidanceScale,
      true,
    );
    validateRange(data.fps, fpsRange, ["fps"], labels.fps);

    const aspectOptions = getParamConfig(parameters, "aspectRatio")?.options;
    if (Array.isArray(aspectOptions) && aspectOptions.length > 0) {
      if (!aspectOptions.includes(data.aspectRatio)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["aspectRatio"],
          message: unsupportedAspectRatio,
        });
      }
    }

    const resolutionOptions = getParamConfig(parameters, "resolution")?.options;
    if (Array.isArray(resolutionOptions) && resolutionOptions.length > 0) {
      if (!resolutionOptions.includes(data.resolution)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resolution"],
          message: unsupportedResolution,
        });
      }
    }
  });
}

function buildAudioSchema(models: AudioModelCatalogItem[], t?: TranslationFn) {
  const modelMap = new Map(models.map((model) => [model.key, model]));
  const invalidModelMessage = t
    ? t("invalidModel")
    : "지원하지 않는 모델입니다.";
  const promptRequired = t ? t("promptRequired") : "프롬프트를 입력해주세요.";
  const labels = {
    speed: t ? t("labels.speed") : "속도",
    chunkSize: "Chunk Size",
    temperature: "Temperature",
    topK: "Top K",
    repetitionPenalty: "Repetition Penalty",
  };
  const rangeMessage = (label: string, min: number, max: number) =>
    t
      ? t("range", { label, min, max })
      : `${label}는 ${min}~${max} 범위여야 합니다.`;
  const stepMessage = (label: string, step: number) =>
    t ? t("step", { label, step }) : `${label}는 ${step} 단위로 입력해야 합니다.`;
  const unsupportedVoice = t ? t("unsupportedVoice") : "지원하지 않는 음성입니다.";
  const inputAudioUnsupported = t
    ? t("inputAudioUnsupported")
    : "선택한 모델은 오디오 입력을 지원하지 않습니다.";
  const referenceTextRequired = t
    ? t("referenceTextRequired")
    : "레퍼런스 텍스트를 입력해주세요.";
  const unsupportedSelection = "지원하지 않는 선택값입니다.";

  const schema = z.object({
    prompt: z.string().min(1, promptRequired),
    model: z.string().min(1),
    voice: z.string().optional().or(z.literal("")),
    speed: z.number().optional(),
    seed: z.string().optional().or(z.literal("")),
    inputAudio: z.string().optional().or(z.literal("")),
    referenceText: z.string().optional().or(z.literal("")),
    modeChoice: z.string().optional().or(z.literal("")),
    language: z.string().optional().or(z.literal("")),
    speaker: z.string().optional().or(z.literal("")),
    streamMode: z.boolean().optional(),
    referencePreset: z.string().optional().or(z.literal("")),
    customInstruction: z.string().optional().or(z.literal("")),
    voiceInstruction: z.string().optional().or(z.literal("")),
    xvecOnly: z.boolean().optional(),
    chunkSize: z.number().optional(),
    temperature: z.number().optional(),
    topK: z.number().optional(),
    repetitionPenalty: z.number().optional(),
  });

  return schema.superRefine((data, ctx) => {
    const model = modelMap.get(data.model);
    if (!model) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["model"],
        message: invalidModelMessage,
      });
      return;
    }

    const parameters = (model.parameters ?? {}) as Record<string, unknown>;
    const speedRange = resolveRange(
      getParamConfig(parameters, "speed"),
      audioFallbackRanges.speed,
    );

    if (typeof data.speed === "number") {
      if (data.speed < speedRange.min || data.speed > speedRange.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["speed"],
          message: rangeMessage(labels.speed, speedRange.min, speedRange.max),
        });
      } else if (speedRange.step > 0) {
        const offset = data.speed - speedRange.min;
        const quotient = offset / speedRange.step;
        if (Math.abs(quotient - Math.round(quotient)) > 1e-6) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["speed"],
            message: stepMessage(labels.speed, speedRange.step),
          });
        }
      }
    }

    const validateOption = (
      key: "voice" | "speaker" | "modeChoice" | "language" | "referencePreset",
      value: string | undefined,
      message = unsupportedSelection,
    ) => {
      if (!value?.trim()) return;
      const config = getParamConfig(parameters, key);
      if (
        config?.options?.length &&
        !hasRuntimeParameterOption(config.options, value)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message,
        });
      }
    };

    validateOption("voice", data.voice, unsupportedVoice);
    validateOption("speaker", data.speaker);
    validateOption("modeChoice", data.modeChoice);
    validateOption("language", data.language);
    validateOption("referencePreset", data.referencePreset);

    const inputAudio = data.inputAudio?.trim() ?? "";
    if (inputAudio && !Boolean(model.meta.supports_input_audio)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inputAudio"],
        message: inputAudioUnsupported,
      });
    }

    const referenceTextConfig = getParamConfig(parameters, "referenceText");
    if (referenceTextConfig?.required && inputAudio && !(data.referenceText?.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["referenceText"],
        message: referenceTextRequired,
      });
    }

    const validateNumeric = (
      key: "chunkSize" | "temperature" | "topK" | "repetitionPenalty",
      value: number | undefined,
      label: string,
    ) => {
      if (typeof value !== "number") return;
      const range = resolveRange(
        getParamConfig(parameters, key),
        key === "chunkSize"
          ? audioFallbackRanges.chunkSize
          : key === "temperature"
            ? audioFallbackRanges.temperature
            : key === "topK"
              ? audioFallbackRanges.topK
              : audioFallbackRanges.repetitionPenalty,
      );
      if (value < range.min || value > range.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: rangeMessage(label, range.min, range.max),
        });
        return;
      }
      if (range.step > 0) {
        const offset = value - range.min;
        const quotient = offset / range.step;
        if (Math.abs(quotient - Math.round(quotient)) > 1e-6) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: stepMessage(label, range.step),
          });
        }
      }
    };

    validateNumeric("chunkSize", data.chunkSize, labels.chunkSize);
    validateNumeric("temperature", data.temperature, labels.temperature);
    validateNumeric("topK", data.topK, labels.topK);
    validateNumeric(
      "repetitionPenalty",
      data.repetitionPenalty,
      labels.repetitionPenalty,
    );
  });
}

function buildNoModelsResult<TOutput>(message: string) {
  const error = new z.ZodError([
    {
      code: z.ZodIssueCode.custom,
      path: ["model"],
      message,
    },
  ]) as z.ZodError<TOutput>;
  const result: SafeParseResult<TOutput> = {
    success: false,
    error,
  };
  return result;
}

export async function validateImageGenerationPayload(
  payload: unknown,
  t?: TranslationFn,
) {
  const catalog = await getModelCatalog();
  const imageModels = catalog.filter(
    (item): item is ImageModelCatalogItem => item.type === "image",
  );
  if (imageModels.length === 0) {
    const message = t ? t("noModels") : "등록된 이미지 모델이 없습니다.";
    return buildNoModelsResult<ImageGenerationFormValues>(message);
  }
  const schema = buildImageSchema(imageModels, t);
  const parsed = schema.safeParse(payload);
  return parsed as SafeParseResult<ImageGenerationFormValues>;
}

export async function validateVideoGenerationPayload(
  payload: unknown,
  t?: TranslationFn,
) {
  const catalog = await getModelCatalog();
  const videoModels = catalog.filter(
    (item): item is VideoModelCatalogItem => item.type === "video",
  );
  if (videoModels.length === 0) {
    const message = t ? t("noModels") : "등록된 비디오 모델이 없습니다.";
    return buildNoModelsResult<VideoGenerationFormValues>(message);
  }
  const schema = buildVideoSchema(videoModels, t);
  const parsed = schema.safeParse(payload);
  return parsed as SafeParseResult<VideoGenerationFormValues>;
}

export async function validateAudioGenerationPayload(
  payload: unknown,
  t?: TranslationFn,
) {
  const catalog = await getModelCatalog();
  const audioModels = catalog.filter(
    (item): item is AudioModelCatalogItem => item.type === "audio",
  );
  if (audioModels.length === 0) {
    const message = t ? t("noModels") : "등록된 오디오 모델이 없습니다.";
    return buildNoModelsResult<AudioGenerationFormValues>(message);
  }
  const schema = buildAudioSchema(audioModels, t);
  const parsed = schema.safeParse(payload);
  return parsed as SafeParseResult<AudioGenerationFormValues>;
}
