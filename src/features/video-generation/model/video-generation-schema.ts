import { z } from "zod";
import {
  defaultVideoModelKey,
  videoModelDefaults,
  videoModelMeta,
  videoModelOptions,
  type VideoGenerationModel,
} from "@/features/video-generation/model/video-models";

export { videoModelMeta, videoModelOptions, type VideoGenerationModel };

export const videoAspectRatioOptions = ["16:9", "9:16", "1:1"] as const;
export const videoResolutionOptions = [480, 640, 720, 832] as const;
export const videoDurationRange = { min: 1, max: 5, step: 1 } as const;
export const videoFpsRange = { min: 16, max: 16, step: 1 } as const;
export const videoStepsRange = { min: 4, max: 8, step: 1 } as const;

export type VideoResolution = (typeof videoResolutionOptions)[number];

const literalUnion = <T extends number>(values: readonly T[]) =>
  z.union(
    values.map((value) => z.literal(value)) as [
      z.ZodLiteral<T>,
      ...z.ZodLiteral<T>[],
    ],
  );

export const videoGenerationSchema = z
  .object({
    prompt: z.string().min(1, "프롬프트를 입력해주세요."),
    initImage: z.string().optional().or(z.literal("")),
    model: z.enum(videoModelOptions),
    aspectRatio: z.enum(videoAspectRatioOptions),
    resolution: literalUnion(videoResolutionOptions),
    durationSec: z
      .number()
      .int()
      .min(videoDurationRange.min)
      .max(videoDurationRange.max),
    fps: z.number().int().min(videoFpsRange.min).max(videoFpsRange.max),
    steps: z
      .number()
      .int()
      .min(videoStepsRange.min)
      .max(videoStepsRange.max),
    guidanceScale: z.number().min(0).max(10),
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
  });

export type VideoGenerationFormValues = z.infer<typeof videoGenerationSchema>;

const defaultModel: VideoGenerationModel = defaultVideoModelKey;
const defaultSettings = videoModelDefaults[defaultModel];

export const videoGenerationDefaults: VideoGenerationFormValues = {
  prompt: "",
  initImage: "",
  model: defaultModel,
  aspectRatio: "16:9",
  resolution: 720,
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
  ratio: (typeof videoAspectRatioOptions)[number],
  resolution: VideoResolution,
) {
  const base = aspectRatioBaseMeta[ratio];
  const scale = resolution / 720;
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
