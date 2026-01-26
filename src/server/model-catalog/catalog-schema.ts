import { z } from "zod";

const parameterUiOptions = [
  "range",
  "input",
  "textarea",
  "select",
  "toggle",
  "hidden",
  "card",
  "upload",
] as const;

const parameterSchema = z
  .object({
    ui: z.enum(parameterUiOptions),
    label: z.string().optional(),
    required: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    options: z.array(z.union([z.string(), z.number()])).optional(),
  })
  .passthrough();

const imageParametersSchema = z
  .object({
    prompt: parameterSchema,
    width: parameterSchema,
    height: parameterSchema,
    steps: parameterSchema,
    modeChoice: parameterSchema.optional(),
    guidanceScale: parameterSchema.optional(),
    promptUpsampling: parameterSchema.optional(),
    seed: parameterSchema.optional(),
    imageCount: parameterSchema,
  })
  .passthrough();

const videoParametersSchema = z
  .object({
    prompt: parameterSchema,
    initImage: parameterSchema.optional(),
    durationSec: parameterSchema,
    steps: parameterSchema,
    guidanceScale: parameterSchema,
    seed: parameterSchema.optional(),
    aspectRatio: parameterSchema.optional(),
    resolution: parameterSchema.optional(),
    fps: parameterSchema.optional(),
  })
  .passthrough();

const hfSpaceConfigSchema = z
  .object({
    space_id: z.string().min(1),
    api_name: z.string().min(1),
    timeout_ms: z.number().int().positive().optional(),
    space_url: z.string().min(1).optional(),
    input_images_format: z.enum(["file_array", "gallery"]).optional(),
  })
  .passthrough();

const imageMetaSchema = z.object({
  pipeline: z.string().min(1),
  model_id: z.string().min(1),
  default_width: z.number().int().positive(),
  default_height: z.number().int().positive(),
  default_steps: z.number().int().positive(),
  concurrent_limit: z.number().int().positive().nullable().optional(),
  max_input_images: z.number().int().nonnegative(),
});

const videoMetaSchema = z.object({
  supports_init_image: z.boolean(),
  t2v_model_id: z.string().min(1),
  i2v_model_id: z.string().nullable().optional(),
  default_width: z.number().int().positive(),
  default_height: z.number().int().positive(),
  default_duration_sec: z.number().positive(),
  default_fps: z.number().int().positive(),
  default_steps: z.number().int().positive(),
  default_guidance_scale: z.number().nonnegative(),
  concurrent_limit: z.number().int().positive().nullable().optional(),
});

const baseModelSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["image", "video"]),
  key: z.string().min(1),
  label: z.string().min(1),
  vendor: z.string().min(1),
  provider: z.literal("hf_space"),
  providerConfig: hfSpaceConfigSchema,
  parameters: z.unknown(),
  meta: z.unknown(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const imageModelSchema = baseModelSchema.extend({
  type: z.literal("image"),
  parameters: imageParametersSchema,
  meta: imageMetaSchema,
});

const videoModelSchema = baseModelSchema.extend({
  type: z.literal("video"),
  parameters: videoParametersSchema,
  meta: videoMetaSchema,
});

const baseModelInputSchema = z.object({
  type: z.enum(["image", "video"]),
  key: z.string().min(1),
  label: z.string().min(1),
  vendor: z.string().min(1),
  provider: z.literal("hf_space"),
  providerConfig: hfSpaceConfigSchema,
  parameters: z.unknown(),
  meta: z.unknown(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

const imageModelInputSchema = baseModelInputSchema.extend({
  type: z.literal("image"),
  parameters: imageParametersSchema,
  meta: imageMetaSchema,
});

const videoModelInputSchema = baseModelInputSchema.extend({
  type: z.literal("video"),
  parameters: videoParametersSchema,
  meta: videoMetaSchema,
});

export const modelCatalogSchema = z.array(
  z.union([imageModelSchema, videoModelSchema]),
);

export const modelCatalogInputSchema = z.union([
  imageModelInputSchema,
  videoModelInputSchema,
]);

export type ModelCatalogItem = z.infer<typeof modelCatalogSchema>[number];
export type ImageModelCatalogItem = z.infer<typeof imageModelSchema>;
export type VideoModelCatalogItem = z.infer<typeof videoModelSchema>;
export type ModelCatalogType = ModelCatalogItem["type"];
export type ModelCatalogInput = z.infer<typeof modelCatalogInputSchema>;

export type ModelCatalogParams = {
  includeInactive?: boolean;
  includeDefaults?: boolean;
};
