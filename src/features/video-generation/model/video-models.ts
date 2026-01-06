import { z } from "zod";
import rawCatalog from "@/../configs/video-models.json";

const videoModelSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  vendor: z.string().min(1),
  provider: z.string().optional(),
  supports_init_image: z.boolean(),
  t2v_model_id: z.string().min(1),
  i2v_model_id: z.string().nullable().optional(),
  default_width: z.number().int().positive(),
  default_height: z.number().int().positive(),
  default_duration_sec: z.number().int().positive(),
  default_fps: z.number().int().positive(),
  default_steps: z.number().int().positive(),
  default_guidance_scale: z.number().nonnegative(),
});

const videoModelCatalogSchema = z.object({
  version: z.number().optional(),
  default_model: z.string().optional(),
  models: z.array(videoModelSchema).min(1),
});

const catalog = videoModelCatalogSchema.parse(rawCatalog);

export type VideoModel = z.infer<typeof videoModelSchema>;

export const videoModels: VideoModel[] = catalog.models;

const modelKeys = videoModels.map((model) => model.key);

function ensureNonEmpty<T>(items: T[]): [T, ...T[]] {
  if (items.length === 0) {
    throw new Error("VIDEO_MODELS_EMPTY");
  }
  return items as [T, ...T[]];
}

export const videoModelOptions = ensureNonEmpty(modelKeys);

export type VideoGenerationModel = (typeof videoModelOptions)[number];

export const videoModelMeta: Record<
  VideoGenerationModel,
  { label: string; supportsInitImage: boolean }
> = Object.fromEntries(
  videoModels.map((model) => [
    model.key,
    {
      label: model.label,
      supportsInitImage: model.supports_init_image,
    },
  ])
) as Record<VideoGenerationModel, { label: string; supportsInitImage: boolean }>;

export const videoModelDefaults: Record<
  VideoGenerationModel,
  { steps: number; guidanceScale: number; durationSec: number; fps: number }
> = Object.fromEntries(
  videoModels.map((model) => [
    model.key,
    {
      steps: model.default_steps,
      guidanceScale: model.default_guidance_scale,
      durationSec: model.default_duration_sec,
      fps: model.default_fps,
    },
  ])
) as Record<
  VideoGenerationModel,
  { steps: number; guidanceScale: number; durationSec: number; fps: number }
>;

export const defaultVideoModelKey: VideoGenerationModel =
  (catalog.default_model &&
    modelKeys.includes(catalog.default_model) &&
    (catalog.default_model as VideoGenerationModel)) ||
  videoModelOptions[0];
