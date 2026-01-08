import { z } from "zod";
import {
  defaultModelKey,
  modelDefaults,
  modelImageLimits,
  modelOptions,
  type ImageGenerationModel,
} from "@/features/image-generation/model/image-models";

export const imageSizeRange = { min: 512, max: 2048, step: 1 } as const;
export const imageStepsRange = { min: 1, max: 20, step: 1 } as const;

export { modelOptions, modelDefaults, modelImageLimits, type ImageGenerationModel };

export const imageGenerationSchema = z.object({
  prompt: z.string().min(1, "프롬프트를 입력해주세요."),
  negativePrompt: z.string().optional().or(z.literal("")),
  width: z.number().int().min(imageSizeRange.min).max(imageSizeRange.max),
  height: z.number().int().min(imageSizeRange.min).max(imageSizeRange.max),
  initImages: z.array(z.string()).optional(),
  model: z.enum(modelOptions),
  imageCount: z.number().min(1).max(1),
  cfgScale: z.number().min(0).max(20),
  steps: z.number().min(imageStepsRange.min).max(imageStepsRange.max),
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

const defaultModel: ImageGenerationModel = defaultModelKey;
const defaultModelSettings = modelDefaults[defaultModel];

export const imageGenerationDefaults: ImageGenerationFormValues = {
  prompt: "",
  negativePrompt: "",
  width: defaultModelSettings.width,
  height: defaultModelSettings.height,
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
