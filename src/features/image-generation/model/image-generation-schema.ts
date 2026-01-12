import { z } from "zod";
import {
  defaultModelKey,
  getImageParamRange,
  modelDefaults,
  modelImageLimits,
  modelOptions,
  type ImageGenerationModel,
} from "@/features/image-generation/model/image-models";

export { modelOptions, modelDefaults, modelImageLimits, type ImageGenerationModel };

const imageGenerationBaseSchema = z.object({
  prompt: z.string().min(1, "프롬프트를 입력해주세요."),
  width: z.number().int(),
  height: z.number().int(),
  initImages: z.array(z.string()).optional(),
  model: z.enum(modelOptions),
  imageCount: z.number().int(),
  steps: z.number().int(),
  seed: z.string().optional().or(z.literal("")),
});

export const imageGenerationOpenApiSchema = imageGenerationBaseSchema;

export const imageGenerationSchema = imageGenerationBaseSchema.superRefine((data, ctx) => {
  const widthRange = getImageParamRange(data.model, "width");
  const heightRange = getImageParamRange(data.model, "height");
  const stepsRange = getImageParamRange(data.model, "steps");
  const countRange = getImageParamRange(data.model, "imageCount");

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

  validateRange(data.width, widthRange, ["width"], "너비");
  validateRange(data.height, heightRange, ["height"], "높이");
  validateRange(data.steps, stepsRange, ["steps"], "스텝");
  validateRange(data.imageCount, countRange, ["imageCount"], "이미지 개수");

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
  width: defaultModelSettings.width,
  height: defaultModelSettings.height,
  initImages: [],
  model: defaultModel,
  imageCount: 1,
  steps: defaultModelSettings.steps,
  seed: "",
};
