import { z } from "zod";
import {
  defaultVideoModelKey,
  getVideoParamConfig,
  getVideoParamRange,
  videoModelDefaults,
  videoModelMeta,
  videoModelOptions,
  type VideoGenerationModel,
} from "@/features/video-generation/model/video-models";

export { videoModelMeta, videoModelOptions, type VideoGenerationModel };

type TranslationFn = (key: string, values?: Record<string, unknown>) => string;

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

const buildVideoGenerationBaseSchema = (t?: TranslationFn) => {
  const promptRequired = t ? t("promptRequired") : "프롬프트를 입력해주세요.";
  const initImageRequiredMessage = t ? t("initImageRequired") : "initImage는 필수입니다.";
  const initImageSchema = buildInitImageSchema(t);
  const videoGenerationSharedSchema = z.object({
    prompt: z.string().min(1, promptRequired),
    aspectRatio: z.string().min(1),
    resolution: z.number().int(),
    durationSec: z.number(),
    fps: z.number().int(),
    steps: z.number().int(),
    guidanceScale: z.number(),
    seed: z.string().optional().or(z.literal("")),
  });

  const initImageRequiredSchema = initImageSchema.min(1, initImageRequiredMessage);

  const initImageRequiredModels = videoModelOptions.filter(
    (model) => videoModelMeta[model]?.supportsInitImage,
  );
  const initImageOptionalModels = videoModelOptions.filter(
    (model) => !videoModelMeta[model]?.supportsInitImage,
  );

  const videoVariants = [
    ...initImageRequiredModels.map((model) =>
      videoGenerationSharedSchema.extend({
        model: z.literal(model),
        initImage: initImageRequiredSchema,
      }),
    ),
    ...initImageOptionalModels.map((model) =>
      videoGenerationSharedSchema.extend({
        model: z.literal(model),
        initImage: initImageSchema.optional().or(z.literal("")),
      }),
    ),
  ];

  return z.discriminatedUnion(
    "model",
    videoVariants as [typeof videoVariants[number], ...typeof videoVariants],
  );
};

export const videoGenerationOpenApiSchema = buildVideoGenerationBaseSchema();

export const createVideoGenerationSchema = (t?: TranslationFn) => {
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
  const initImageNeeded = t ? t("initImageNeeded") : "선택한 모델은 이미지 입력이 필요합니다.";
  const initImageUnsupported = t
    ? t("initImageUnsupported")
    : "선택한 모델은 이미지 입력을 지원하지 않습니다.";
  const unsupportedAspectRatio = t ? t("unsupportedAspectRatio") : "지원하지 않는 비율입니다.";
  const unsupportedResolution = t ? t("unsupportedResolution") : "지원하지 않는 해상도입니다.";

  return buildVideoGenerationBaseSchema(t).superRefine((data, ctx) => {
    const supportsInitImage =
      videoModelMeta[data.model]?.supportsInitImage ?? false;
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

    const durationRange = getVideoParamRange(data.model, "durationSec");
    const stepsRange = getVideoParamRange(data.model, "steps");
    const guidanceRange = getVideoParamRange(data.model, "guidanceScale");
    const fpsRange = getVideoParamRange(data.model, "fps");

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

    const aspectOptions = getVideoParamConfig(data.model, "aspectRatio")?.options;
    if (Array.isArray(aspectOptions) && aspectOptions.length > 0) {
      if (!aspectOptions.includes(data.aspectRatio)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["aspectRatio"],
          message: unsupportedAspectRatio,
        });
      }
    }

    const resolutionOptions = getVideoParamConfig(data.model, "resolution")?.options;
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
};

export const videoGenerationSchema = createVideoGenerationSchema();

export type VideoGenerationFormValues = z.infer<typeof videoGenerationSchema>;

const defaultModel: VideoGenerationModel = defaultVideoModelKey;
const defaultSettings = videoModelDefaults[defaultModel];

export const videoGenerationDefaults: VideoGenerationFormValues = {
  prompt: "",
  initImage: "",
  model: defaultModel,
  aspectRatio: defaultSettings.aspectRatio,
  resolution: defaultSettings.resolution,
  durationSec: defaultSettings.durationSec,
  fps: defaultSettings.fps,
  steps: defaultSettings.steps,
  guidanceScale: defaultSettings.guidanceScale,
  seed: "",
};

const aspectRatioBaseMeta = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 720, height: 720 },
} as const;

export function resolveVideoAspectRatioSize(
  ratio: string,
  resolution: number,
) {
  const base =
    aspectRatioBaseMeta[ratio as keyof typeof aspectRatioBaseMeta] ??
    aspectRatioBaseMeta["16:9"];
  const safeResolution = Number.isFinite(resolution) && resolution > 0 ? resolution : 720;
  const scale = safeResolution / 720;
  return {
    width: roundToMultiple(Math.round(base.width * scale), 16),
    height: roundToMultiple(Math.round(base.height * scale), 16),
  };
}

function roundToMultiple(value: number, multiple: number) {
  if (multiple <= 1) {
    return value;
  }
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}
