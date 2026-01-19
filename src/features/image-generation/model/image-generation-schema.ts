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

type TranslationFn = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

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

export const createImageGenerationSchema = (t?: TranslationFn) => {
  const promptRequired = t
    ? t("promptRequired")
    : "프롬프트를 입력해주세요.";
  const labelMap = {
    width: t ? t("labels.width") : "너비",
    height: t ? t("labels.height") : "높이",
    steps: t ? t("labels.steps") : "스텝",
    imageCount: t ? t("labels.imageCount") : "이미지 개수",
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

  return imageGenerationBaseSchema
    .extend({ prompt: z.string().min(1, promptRequired) })
    .superRefine((data, ctx) => {
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

      const limit = modelImageLimits[data.model]?.maxInputImages ?? 0;
      const count = data.initImages?.length ?? 0;
      if (count > 0 && limit === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["initImages"],
          message: initImageUnsupported,
        });
        return;
      }
      if (count > limit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["initImages"],
          message: maxInputImagesMessage(limit),
        });
      }
    });
};

export const imageGenerationSchema = createImageGenerationSchema();

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
