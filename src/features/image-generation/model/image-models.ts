import { z } from "zod";
import rawCatalog from "@/../configs/image-models.json";

const pipelineOptions = ["diffusion", "sd", "sdxl"] as const;

const imageModelSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  vendor: z.string().min(1),
  pipeline: z.enum(pipelineOptions),
  model_id: z.string().min(1),
  default_width: z.number().int().positive(),
  default_height: z.number().int().positive(),
  default_steps: z.number().int().positive(),
  default_cfg_scale: z.number().nonnegative(),
  default_sampler: z.string().min(1),
  max_input_images: z.number().int().nonnegative(),
});

const imageModelCatalogSchema = z.object({
  version: z.number().optional(),
  default_model: z.string().optional(),
  models: z.array(imageModelSchema).min(1),
});

const catalog = imageModelCatalogSchema.parse(rawCatalog);

export type ImageModel = z.infer<typeof imageModelSchema>;

export const imageModels: ImageModel[] = catalog.models;

const modelKeys = imageModels.map((model) => model.key);

function ensureNonEmpty<T>(items: T[]): [T, ...T[]] {
  if (items.length === 0) {
    throw new Error("IMAGE_MODELS_EMPTY");
  }
  return items as [T, ...T[]];
}

export const modelOptions = ensureNonEmpty(modelKeys);

export type ImageGenerationModel = (typeof modelOptions)[number];

export const modelDefaults: Record<
  ImageGenerationModel,
  { steps: number; cfgScale: number; sampler: string }
> = Object.fromEntries(
  imageModels.map((model) => [
    model.key,
    {
      steps: model.default_steps,
      cfgScale: model.default_cfg_scale,
      sampler: model.default_sampler,
    },
  ])
) as Record<ImageGenerationModel, { steps: number; cfgScale: number; sampler: string }>;

export const modelImageLimits: Record<
  ImageGenerationModel,
  { maxInputImages: number }
> = Object.fromEntries(
  imageModels.map((model) => [
    model.key,
    { maxInputImages: model.max_input_images },
  ])
) as Record<ImageGenerationModel, { maxInputImages: number }>;

export const defaultModelKey: ImageGenerationModel =
  (catalog.default_model &&
    modelKeys.includes(catalog.default_model) &&
    (catalog.default_model as ImageGenerationModel)) ||
  modelOptions[0];
