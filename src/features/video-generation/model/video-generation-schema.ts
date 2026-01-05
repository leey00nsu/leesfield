import { z } from "zod";

export const videoModelOptions = [
  "hunyuanvideo-1.5",
  "hunyuanvideo-i2v",
  "cogvideox-1.5-5b-i2v",
  "step-video-ti2v",
  "svd-xt-1.1",
] as const;

export type VideoGenerationModel = (typeof videoModelOptions)[number];

export const videoModelMeta: Record<
  VideoGenerationModel,
  { label: string; requiresInitImage: boolean }
> = {
  "hunyuanvideo-1.5": {
    label: "HunyuanVideo 1.5",
    requiresInitImage: false,
  },
  "hunyuanvideo-i2v": {
    label: "HunyuanVideo I2V",
    requiresInitImage: true,
  },
  "cogvideox-1.5-5b-i2v": {
    label: "CogVideoX 1.5 5B I2V",
    requiresInitImage: true,
  },
  "step-video-ti2v": {
    label: "Step Video TI2V",
    requiresInitImage: true,
  },
  "svd-xt-1.1": {
    label: "SVD XT 1.1",
    requiresInitImage: true,
  },
};

export const videoAspectRatioOptions = ["16:9", "9:16", "1:1"] as const;
export const videoResolutionOptions = [720, 1080] as const;
export const videoDurationOptions = [2, 4, 6, 8] as const;
export const videoFpsOptions = [12, 24, 30] as const;

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
    steps: z.number().min(1).max(100),
    guidanceScale: z.number().min(0).max(20),
    seed: z.string().optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    const requiresInitImage =
      videoModelMeta[data.model]?.requiresInitImage ?? false;
    const hasInitImage = Boolean(data.initImage?.trim());
    if (requiresInitImage && !hasInitImage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["initImage"],
        message: "선택한 모델은 이미지 입력이 필요합니다.",
      });
    }
  });

export type VideoGenerationFormValues = z.infer<typeof videoGenerationSchema>;

const defaultModel: VideoGenerationModel = "hunyuanvideo-1.5";

export const videoGenerationDefaults: VideoGenerationFormValues = {
  prompt: "",
  initImage: "",
  model: defaultModel,
  aspectRatio: "16:9",
  resolution: 720,
  durationSec: 4,
  fps: 24,
  steps: 30,
  guidanceScale: 6,
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
