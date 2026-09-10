import { generationPayload } from "@/shared/model-catalog/generation-payload";
import { formParameterIssues } from "@/shared/model-catalog/parameter-contract";
import { generationBodySchema, mappedGenerationBodySchema } from "@/shared/api/generation-input";
import {
  assertGradioExecutable,
  getGradioContract,
  gradioInputValues,
} from "@/shared/model-catalog/gradio-contract";
import { z } from "zod";
import {
  normalizeRuntimeParameterOptions,
  hasRuntimeParameterOption,
} from "@/shared/model-catalog/parameter-options";
import { resolveRuntimeParameterLabel } from "@/shared/model-catalog/runtime-utils";
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
  { success: true; data: T } | { success: false; error: z.ZodError<T> };

type NumericRange = {
  min: number;
  max: number;
  step: number;
};

type ParameterConfig = {
  ui?: unknown;
  label?: unknown;
  min?: unknown;
  max?: unknown;
  step?: unknown;
  default?: unknown;
  required?: unknown;
  options?: unknown[];
  binding?: {
    source?: unknown;
    parameterName?: unknown;
    valueType?: unknown;
    canonicalKey?: unknown;
  };
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
    .refine(
      (value) => {
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
      },
      t
        ? t("initImageInvalid")
        : "initImage는 data URL(base64) 또는 http(s) URL이어야 합니다.",
    )
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
  return param && typeof param === "object"
    ? (param as ParameterConfig)
    : undefined;
}

// Model settings drive runtime refinements below and the schema metadata together.
// Legacy defaults are UI suggestions, not server-applied defaults: expose examples.
function numberInput(
  models: { parameters: unknown }[],
  key: string,
  schema: z.ZodNumber,
  fallback: NumericRange,
) {
  if (models.length !== 1) return schema;
  const config = getParamConfig(
    models[0].parameters as Record<string, unknown>,
    key,
  );
  const range = resolveRange(
    config as Record<string, unknown> | undefined,
    fallback,
  );
  return schema.openapi({
    minimum: range.min,
    maximum: range.max,
    "x-step": range.step,
    "x-step-base": range.min,
    ...(typeof config?.default === "number" ? { example: config.default } : {}),
  });
}
function selectionInput<T extends z.ZodType>(
  models: { parameters: unknown }[],
  key: string,
  schema: T,
): T {
  if (models.length !== 1) return schema;
  const config = getParamConfig(
    models[0].parameters as Record<string, unknown>,
    key,
  );
  const options = normalizeRuntimeParameterOptions(config?.options);
  return schema.openapi(
    options ? { enum: options.map((option) => option.value) } : {},
  );
}

function buildImageSchema(models: ImageModelCatalogItem[], t?: TranslationFn) {
  const modelMap = new Map(models.map((model) => [model.key, model]));
  const invalidModelMessage = t
    ? t("invalidModel")
    : "지원하지 않는 모델입니다.";
  const promptRequired = t ? t("promptRequired") : "프롬프트를 입력해주세요.";
  const labelMap = {
    width: t ? t("labels.width") : "너비",
    height: t ? t("labels.height") : "높이",
    steps: t ? t("labels.steps") : "스텝",
    imageCount: t ? t("labels.imageCount") : "이미지 개수",
    guidanceScale: t ? t("labels.guidanceScale") : "가이던스",
  };
  const rangeMessage = (label: string, min: number, max: number) =>
    t
      ? t("range", { label, min, max })
      : `${label}는 ${min}~${max} 범위여야 합니다.`;
  const stepMessage = (label: string, step: number) =>
    t
      ? t("step", { label, step })
      : `${label}는 ${step} 단위로 입력해야 합니다.`;
  const initImageUnsupported = t
    ? t("initImageUnsupported")
    : "선택한 모델은 이미지 입력을 지원하지 않습니다.";
  const maxInputImagesMessage = (limit: number) =>
    t
      ? t("maxInputImages", { limit })
      : `이미지는 최대 ${limit}장까지 업로드할 수 있습니다.`;
  const unsupportedMode = t
    ? t("unsupportedMode")
    : "지원하지 않는 모드입니다.";

  const schema = generationBodySchema("image").extend({
    prompt: z.string().min(1, promptRequired),
    width: numberInput(
      models,
      "width",
      z.number().int(),
      imageFallbackRanges.size,
    ),
    height: numberInput(
      models,
      "height",
      z.number().int(),
      imageFallbackRanges.size,
    ),
    initImages: z.array(z.string()).optional(),
    model: z.string().min(1),
    imageCount: numberInput(
      models,
      "imageCount",
      z.number().int(),
      imageFallbackRanges.count,
    ),
    steps: numberInput(
      models,
      "steps",
      z.number().int(),
      imageFallbackRanges.steps,
    ),
    modeChoice: selectionInput(models, "modeChoice", z.string()).optional(),
    guidanceScale: numberInput(
      models,
      "guidanceScale",
      z.number(),
      imageFallbackRanges.guidance,
    ).optional(),
    promptUpsampling: z.boolean().optional(),
    seed: z.string().optional().or(z.literal("")),
  });

  return schema.superRefine((data, ctx) => {
    const model = modelMap.get(data.model);
    if (model && !getGradioContract(model)) for (const issue of formParameterIssues(model.parameters, data)) ctx.addIssue({code:"custom",path:[issue.name],message:"Invalid parameter: "+issue.reason});
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
        params: { nodeInputReason: "unsupported", limit: 0, count },
      });
      return;
    }
    if (count > maxInputImages) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["initImages"],
        message: maxInputImagesMessage(maxInputImages),
        params: {
          nodeInputReason: "limit_exceeded",
          limit: maxInputImages,
          count,
        },
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
    t
      ? t("range", { label, min, max })
      : `${label}는 ${min}~${max} 범위여야 합니다.`;
  const stepMessage = (label: string, step: number) =>
    t
      ? t("step", { label, step })
      : `${label}는 ${step} 단위로 입력해야 합니다.`;
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

  const schema = generationBodySchema("video").extend({
    prompt: z.string().min(1, promptRequired),
    initImage: initImageSchema.optional().or(z.literal("")),
    model: z.string().min(1),
    aspectRatio: selectionInput(models, "aspectRatio", z.string().min(1)),
    resolution: selectionInput(models, "resolution", z.number().int()),
    durationSec: numberInput(
      models,
      "durationSec",
      z.number(),
      videoFallbackRanges.duration,
    ),
    fps: numberInput(models, "fps", z.number().int(), videoFallbackRanges.fps),
    steps: numberInput(
      models,
      "steps",
      z.number().int(),
      videoFallbackRanges.steps,
    ),
    guidanceScale: numberInput(
      models,
      "guidanceScale",
      z.number(),
      videoFallbackRanges.guidance,
    ),
    seed: z.string().optional().or(z.literal("")),
  });

  return schema.superRefine((data, ctx) => {
    const model = modelMap.get(data.model);
    if (model && !getGradioContract(model)) for (const issue of formParameterIssues(model.parameters, data)) ctx.addIssue({code:"custom",path:[issue.name],message:"Invalid parameter: "+issue.reason});
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

    validateRange(
      data.durationSec,
      durationRange,
      ["durationSec"],
      labels.durationSec,
      true,
    );
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
      if (!hasRuntimeParameterOption(aspectOptions, data.aspectRatio)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["aspectRatio"],
          message: unsupportedAspectRatio,
        });
      }
    }

    const resolutionOptions = getParamConfig(parameters, "resolution")?.options;
    if (Array.isArray(resolutionOptions) && resolutionOptions.length > 0) {
      if (!hasRuntimeParameterOption(resolutionOptions, data.resolution)) {
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
    t
      ? t("step", { label, step })
      : `${label}는 ${step} 단위로 입력해야 합니다.`;
  const unsupportedVoice = t
    ? t("unsupportedVoice")
    : "지원하지 않는 음성입니다.";
  const inputAudioUnsupported = t
    ? t("inputAudioUnsupported")
    : "선택한 모델은 오디오 입력을 지원하지 않습니다.";
  const referenceTextRequired = t
    ? t("referenceTextRequired")
    : "레퍼런스 텍스트를 입력해주세요.";
  const unsupportedSelection = "지원하지 않는 선택값입니다.";

  const schema = generationBodySchema("audio").extend({
    prompt: z.string().min(1, promptRequired),
    model: z.string().min(1),
    voice: selectionInput(models, "voice", z.string())
      .optional()
      .or(z.literal("")),
    speed: numberInput(
      models,
      "speed",
      z.number(),
      audioFallbackRanges.speed,
    ).optional(),
    seed: z.string().optional().or(z.literal("")),
    inputAudio: z.string().optional().or(z.literal("")),
    referenceText: z.string().optional().or(z.literal("")),
    modeChoice: selectionInput(models, "modeChoice", z.string())
      .optional()
      .or(z.literal("")),
    language: selectionInput(models, "language", z.string())
      .optional()
      .or(z.literal("")),
    speaker: selectionInput(models, "speaker", z.string())
      .optional()
      .or(z.literal("")),
    streamMode: z.boolean().optional(),
    referencePreset: selectionInput(models, "referencePreset", z.string())
      .optional()
      .or(z.literal("")),
    customInstruction: z.string().optional().or(z.literal("")),
    voiceInstruction: z.string().optional().or(z.literal("")),
    xvecOnly: z.boolean().optional(),
    chunkSize: numberInput(
      models,
      "chunkSize",
      z.number(),
      audioFallbackRanges.chunkSize,
    ).optional(),
    temperature: numberInput(
      models,
      "temperature",
      z.number(),
      audioFallbackRanges.temperature,
    ).optional(),
    topK: numberInput(
      models,
      "topK",
      z.number(),
      audioFallbackRanges.topK,
    ).optional(),
    repetitionPenalty: numberInput(
      models,
      "repetitionPenalty",
      z.number(),
      audioFallbackRanges.repetitionPenalty,
    ).optional(),
    dynamicParams: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
  });

  return schema.superRefine((data, ctx) => {
    const model = modelMap.get(data.model);
    if (model && !getGradioContract(model)) for (const issue of formParameterIssues(model.parameters, data)) ctx.addIssue({code:"custom",path:[issue.name],message:"Invalid parameter: "+issue.reason});
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
      const speedLabel = resolveRuntimeParameterLabel(
        getParamConfig(parameters, "speed"),
        labels.speed,
      );
      if (data.speed < speedRange.min || data.speed > speedRange.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["speed"],
          message: rangeMessage(speedLabel, speedRange.min, speedRange.max),
        });
      } else if (speedRange.step > 0) {
        const offset = data.speed - speedRange.min;
        const quotient = offset / speedRange.step;
        if (Math.abs(quotient - Math.round(quotient)) > 1e-6) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["speed"],
            message: stepMessage(speedLabel, speedRange.step),
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
    if (
      referenceTextConfig?.required &&
      inputAudio &&
      !data.referenceText?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["referenceText"],
        message: referenceTextRequired,
      });
    }

    const validateNumeric = (
      key: "chunkSize" | "temperature" | "topK" | "repetitionPenalty",
      value: number | undefined,
      fallbackLabel: string,
    ) => {
      if (typeof value !== "number") return;
      const label = resolveRuntimeParameterLabel(
        getParamConfig(parameters, key),
        fallbackLabel,
      );
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

    // Keep these dynamic binding rules in sync with the shared runtime schema.
    const dynamicParams = data.dynamicParams ?? {};
    const dynamicConfigs = Object.entries(parameters).filter(([, value]) => {
      const config = value as ParameterConfig;
      return (
        config?.binding?.source === "hf_space" &&
        typeof config.binding.parameterName === "string" &&
        !config.binding.canonicalKey
      );
    });
    const allowedKeys = new Set(dynamicConfigs.map(([key]) => key));
    for (const key of Object.keys(dynamicParams)) {
      if (!allowedKeys.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dynamicParams", key],
          message: "지원하지 않는 동적 파라미터입니다.",
        });
      }
    }
    for (const [key, rawConfig] of dynamicConfigs) {
      const config = rawConfig as ParameterConfig;
      const value = dynamicParams[key];
      if (config.required === true && value === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dynamicParams", key],
          message: "필수 동적 파라미터입니다.",
        });
        continue;
      }
      if (value === undefined) continue;
      const expectedType = config.binding?.valueType;
      const actualType = typeof value;
      const typeMatches =
        expectedType === "file"
          ? actualType === "string"
          : expectedType === actualType;
      if (!typeMatches) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dynamicParams", key],
          message: "동적 파라미터 타입이 올바르지 않습니다.",
        });
        continue;
      }
      if (typeof value === "number") {
        const min = typeof config.min === "number" ? config.min : undefined;
        const max = typeof config.max === "number" ? config.max : undefined;
        const step = typeof config.step === "number" ? config.step : undefined;
        if (
          (min !== undefined && value < min) ||
          (max !== undefined && value > max)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["dynamicParams", key],
            message: "동적 파라미터 범위가 올바르지 않습니다.",
          });
          continue;
        }
        if (step !== undefined && step > 0) {
          const quotient = (value - (min ?? 0)) / step;
          if (Math.abs(quotient - Math.round(quotient)) > 1e-6) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["dynamicParams", key],
              message: "동적 파라미터 입력 단위가 올바르지 않습니다.",
            });
            continue;
          }
        }
      }
      if (
        config.options?.length &&
        (typeof value === "string" || typeof value === "number") &&
        !hasRuntimeParameterOption(config.options, value)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dynamicParams", key],
          message: unsupportedSelection,
        });
      }
    }
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

function mappedPayloadSchema(model: {
  key: string;
  type: string;
  providerConfig: unknown;
  parameters?: unknown;
}) {
  const contract = getGradioContract(model);
  if (!contract) return null;
  return mappedGenerationBodySchema(model.type as "image" | "video" | "audio")
    .superRefine((data, ctx) => {
      try {
        assertGradioExecutable(contract);
        if (!contract.output || contract.output.media !== model?.type)
          throw new Error("HF_CONTRACT_MEDIA");
        gradioInputValues(contract, data);
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          path: ["dynamicParams"],
          message:
            error instanceof Error ? error.message : "HF_CONTRACT_INVALID",
        });
      }
    });
}

/** Runtime validation and OpenAPI use this same per-model factory. */
export function getModelGenerationSchema(
  model: ImageModelCatalogItem | VideoModelCatalogItem | AudioModelCatalogItem,
  t?: TranslationFn,
) {
  return (
    mappedPayloadSchema(model) ??
    (model.type === "image"
      ? buildImageSchema([model], t)
      : model.type === "video"
        ? buildVideoSchema([model], t)
        : buildAudioSchema([model], t))
  );
}

export async function validateImageGenerationPayload(
  payload: unknown,
  t?: TranslationFn,
  executionModel?: import("./catalog-schema").ModelCatalogItem,
) {
  const catalog = executionModel ? [executionModel] : await getModelCatalog();
  const imageModels = catalog.filter(
    (item): item is ImageModelCatalogItem => item.type === "image",
  );
  if (imageModels.length === 0) {
    const message = t ? t("noModels") : "등록된 이미지 모델이 없습니다.";
    return buildNoModelsResult<ImageGenerationFormValues>(message);
  }
  const key =
    payload && typeof payload === "object"
      ? (payload as { model?: unknown }).model
      : undefined;
  const selected = imageModels.find((model) => model.key === key);
  const schema = selected
    ? getModelGenerationSchema(selected, t)
    : buildImageSchema(imageModels, t);
  const candidate = selected ? generationPayload(selected,payload) : payload;
  const parsed = schema.safeParse(candidate);
  return parsed as SafeParseResult<ImageGenerationFormValues>;
}

export async function validateVideoGenerationPayload(
  payload: unknown,
  t?: TranslationFn,
  executionModel?: import("./catalog-schema").ModelCatalogItem,
) {
  const catalog = executionModel ? [executionModel] : await getModelCatalog();
  const videoModels = catalog.filter(
    (item): item is VideoModelCatalogItem => item.type === "video",
  );
  if (videoModels.length === 0) {
    const message = t ? t("noModels") : "등록된 비디오 모델이 없습니다.";
    return buildNoModelsResult<VideoGenerationFormValues>(message);
  }
  const key =
    payload && typeof payload === "object"
      ? (payload as { model?: unknown }).model
      : undefined;
  const selected = videoModels.find((model) => model.key === key);
  const schema = selected
    ? getModelGenerationSchema(selected, t)
    : buildVideoSchema(videoModels, t);
  const candidate = selected ? generationPayload(selected,payload) : payload;
  const parsed = schema.safeParse(candidate);
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
  const key =
    payload && typeof payload === "object"
      ? (payload as { model?: unknown }).model
      : undefined;
  const selected = audioModels.find((model) => model.key === key);
  const schema = selected
    ? getModelGenerationSchema(selected, t)
    : buildAudioSchema(audioModels, t);
  const parsed = schema.safeParse(selected ? generationPayload(selected, payload) : payload);
  return parsed as SafeParseResult<AudioGenerationFormValues>;
}
