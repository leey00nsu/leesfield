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

export const videoGenerationSchema = z
  .object({
    prompt: z.string().min(1, "프롬프트를 입력해주세요."),
    initImage: z.string().optional().or(z.literal("")),
    model: z.enum(videoModelOptions),
    aspectRatio: z.string().min(1),
    resolution: z.number().int(),
    durationSec: z.number(),
    fps: z.number().int(),
    steps: z.number().int(),
    guidanceScale: z.number(),
    seed: z.string().optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    const supportsInitImage =
      videoModelMeta[data.model]?.supportsInitImage ?? false;
    const hasInitImage = Boolean(data.initImage?.trim());
    if (supportsInitImage && !hasInitImage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["initImage"],
        message: "선택한 모델은 이미지 입력이 필요합니다.",
      });
    }
    if (hasInitImage && !supportsInitImage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["initImage"],
        message: "선택한 모델은 이미지 입력을 지원하지 않습니다.",
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
          message: `${label}는 정수만 허용됩니다.`,
        });
        return;
      }
      if (value < range.min || value > range.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `${label}는 ${range.min}~${range.max} 범위여야 합니다.`,
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
            message: `${label}는 ${range.step} 단위로 입력해야 합니다.`,
          });
        }
      }
    };

    const durationRange = getVideoParamRange(data.model, "durationSec");
    const stepsRange = getVideoParamRange(data.model, "steps");
    const guidanceRange = getVideoParamRange(data.model, "guidanceScale");
    const fpsRange = getVideoParamRange(data.model, "fps");

    validateRange(data.durationSec, durationRange, ["durationSec"], "재생시간", true);
    validateRange(data.steps, stepsRange, ["steps"], "스텝");
    validateRange(data.guidanceScale, guidanceRange, ["guidanceScale"], "가이던스", true);
    validateRange(data.fps, fpsRange, ["fps"], "FPS");

    const aspectOptions = getVideoParamConfig(data.model, "aspectRatio")?.options;
    if (Array.isArray(aspectOptions) && aspectOptions.length > 0) {
      if (!aspectOptions.includes(data.aspectRatio)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["aspectRatio"],
          message: "지원하지 않는 비율입니다.",
        });
      }
    }

    const resolutionOptions = getVideoParamConfig(data.model, "resolution")?.options;
    if (Array.isArray(resolutionOptions) && resolutionOptions.length > 0) {
      if (!resolutionOptions.includes(data.resolution)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resolution"],
          message: "지원하지 않는 해상도입니다.",
        });
      }
    }
  });

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
