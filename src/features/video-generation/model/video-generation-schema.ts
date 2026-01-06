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
export const videoResolutionOptions = [480, 720] as const;
export const videoDurationOptions = [2, 4] as const;
export const videoFpsOptions = [12, 24] as const;

export type VideoResolution = (typeof videoResolutionOptions)[number];

export const videoGenerationSchema = z
  .object({
    prompt: z.string().min(1, "프롬프트를 입력해주세요."),
    initImage: z.string().optional().or(z.literal("")),
    model: z.enum(videoModelOptions),
    aspectRatio: z.enum(videoAspectRatioOptions),
    resolution: z.union(
      videoResolutionOptions.map((value) => z.literal(value)) as [
        z.ZodLiteral<VideoResolution>,
        z.ZodLiteral<VideoResolution>,
      ],
    ),
  durationSec: z.union(
    videoDurationOptions.map((value) => z.literal(value)) as [
      z.ZodLiteral<(typeof videoDurationOptions)[number]>,
      z.ZodLiteral<(typeof videoDurationOptions)[number]>,
    ],
  ),
  fps: z.union(
    videoFpsOptions.map((value) => z.literal(value)) as [
      z.ZodLiteral<(typeof videoFpsOptions)[number]>,
      z.ZodLiteral<(typeof videoFpsOptions)[number]>,
    ],
  ),
    steps: z.number().min(1).max(100),
    guidanceScale: z.number().min(0).max(20),
    seed: z.string().optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    const supportsInitImage =
      videoModelMeta[data.model]?.supportsInitImage ?? false;
    const hasInitImage = Boolean(data.initImage?.trim());
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
    width: Math.round(base.width * scale),
    height: Math.round(base.height * scale),
  };
}
