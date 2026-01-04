import { z } from "zod";

export const aspectRatioOptions = ["1:1", "4:3", "16:9", "9:16"] as const;
export const resolutionOptions = [512, 1024] as const;

export const modelOptions = [
  "z-image-turbo",
  "sdxl-base-1.0",
  "openjourney",
  "sdxl-turbo",
] as const;

export type ImageGenerationModel = (typeof modelOptions)[number];

export const modelDefaults: Record<
  ImageGenerationModel,
  { steps: number; cfgScale: number; sampler: string }
> = {
  "z-image-turbo": { steps: 8, cfgScale: 0, sampler: "Default" },
  "sdxl-base-1.0": { steps: 30, cfgScale: 7, sampler: "Euler a" },
  "openjourney": { steps: 30, cfgScale: 7, sampler: "Euler a" },
  "sdxl-turbo": { steps: 2, cfgScale: 0, sampler: "Default" },
};

export const modelImageLimits: Record<
  ImageGenerationModel,
  { maxInputImages: number }
> = {
  "z-image-turbo": { maxInputImages: 1 },
  "sdxl-base-1.0": { maxInputImages: 0 },
  "openjourney": { maxInputImages: 0 },
  "sdxl-turbo": { maxInputImages: 0 },
};

export const imageGenerationSchema = z.object({
  prompt: z.string().min(1, "프롬프트를 입력해주세요."),
  negativePrompt: z.string().optional().or(z.literal("")),
  aspectRatio: z.enum(aspectRatioOptions),
  resolution: z
    .number()
    .refine((value) => resolutionOptions.includes(value), {
      message: "해상도를 선택해주세요.",
    }),
  initImages: z.array(z.string()).optional(),
  model: z.enum(modelOptions),
  imageCount: z.number().min(1).max(8),
  cfgScale: z.number().min(0).max(20),
  steps: z.number().min(1).max(150),
  seed: z.string().optional().or(z.literal("")),
  sampler: z.string().optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  const limit = modelImageLimits[data.model]?.maxInputImages ?? 0;
  const count = data.initImages?.length ?? 0;
  if (count > 0 && limit === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["initImages"],
      message: "선택한 모델은 이미지 입력을 지원하지 않습니다.",
    });
    return;
  }
  if (count > limit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["initImages"],
      message: `이미지는 최대 ${limit}장까지 업로드할 수 있습니다.`,
    });
  }
});

export type ImageGenerationFormValues = z.infer<typeof imageGenerationSchema>;

const defaultModel: ImageGenerationModel = "z-image-turbo";
const defaultModelSettings = modelDefaults[defaultModel];

export const imageGenerationDefaults: ImageGenerationFormValues = {
  prompt: "",
  negativePrompt: "",
  aspectRatio: "1:1",
  resolution: 512,
  initImages: [],
  model: defaultModel,
  imageCount: 1,
  cfgScale: defaultModelSettings.cfgScale,
  steps: defaultModelSettings.steps,
  seed: "",
  sampler: defaultModelSettings.sampler,
};

export const samplerOptions = [
  "Default",
  "Euler a",
  "DPM++ 2M Karras",
  "DPM++ SDE Karras",
  "DDIM",
] as const;

const aspectRatioBaseMeta = {
  "1:1": { width: 512, height: 512 },
  "4:3": { width: 512, height: 384 },
  "16:9": { width: 640, height: 360 },
  "9:16": { width: 360, height: 640 },
} as const;

export function resolveAspectRatioSize(
  ratio: (typeof aspectRatioOptions)[number],
  resolution: number
) {
  const base = aspectRatioBaseMeta[ratio];
  const scale = resolution / 512;
  return {
    width: Math.round(base.width * scale),
    height: Math.round(base.height * scale),
  };
}
