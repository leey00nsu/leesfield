import { z } from "zod";

export const videoModelOptions = [
  "svd-xt-1.1",
  "svd-1.1",
  "gen-2-alpha",
  "luma-dream-machine",
] as const;

export type VideoGenerationModel = (typeof videoModelOptions)[number];

export const videoAspectRatioOptions = ["16:9", "9:16", "1:1"] as const;
export const videoResolutionOptions = [720, 1080] as const;
export const videoDurationOptions = [2, 4, 6, 8] as const;
export const videoFpsOptions = [12, 24, 30] as const;

export type VideoResolution = (typeof videoResolutionOptions)[number];

export const videoGenerationSchema = z.object({
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
      z.ZodLiteral<(typeof videoDurationOptions)[number]>,
      z.ZodLiteral<(typeof videoDurationOptions)[number]>,
    ],
  ),
  fps: z.union(
    videoFpsOptions.map((value) => z.literal(value)) as [
      z.ZodLiteral<(typeof videoFpsOptions)[number]>,
      z.ZodLiteral<(typeof videoFpsOptions)[number]>,
      z.ZodLiteral<(typeof videoFpsOptions)[number]>,
    ],
  ),
});

export type VideoGenerationFormValues = z.infer<typeof videoGenerationSchema>;

const defaultModel: VideoGenerationModel = "svd-xt-1.1";

export const videoGenerationDefaults: VideoGenerationFormValues = {
  prompt: "",
  initImage: "",
  model: defaultModel,
  aspectRatio: "16:9",
  resolution: 720,
  durationSec: 4,
  fps: 24,
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
