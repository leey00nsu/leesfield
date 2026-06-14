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

const parameterOptionValueSchema = z.union([z.string(), z.number()]);
const parameterOptionSchema = z.object({
  label: z.string().min(1),
  value: parameterOptionValueSchema,
});
const parameterOptionInputSchema = z.union([
  parameterOptionValueSchema.transform((value) => ({
    label: String(value),
    value,
  })),
  z
    .tuple([z.string().min(1), parameterOptionValueSchema])
    .transform(([label, value]) => ({
      label,
      value,
    })),
  parameterOptionSchema,
]);

const hfParameterBindingSchema = z
  .object({
    source: z.literal("hf_space"),
    parameterName: z.string().min(1),
    valueType: z.enum(["string", "number", "boolean", "file"]),
    canonicalKey: z.string().min(1).optional(),
    order: z.number().int().nonnegative(),
  })
  .strict();

const parameterSchema = z
  .object({
    ui: z.enum(parameterUiOptions),
    label: z.string().optional(),
    required: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    options: z.array(parameterOptionInputSchema).optional(),
    binding: hfParameterBindingSchema.optional(),
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

const audioParametersSchema = z
  .object({
    prompt: parameterSchema,
    voice: parameterSchema.optional(),
    speaker: parameterSchema.optional(),
    speed: parameterSchema.optional(),
    seed: parameterSchema.optional(),
    inputAudio: parameterSchema.optional(),
    referenceText: parameterSchema.optional(),
    modeChoice: parameterSchema.optional(),
    language: parameterSchema.optional(),
    streamMode: parameterSchema.optional(),
    referencePreset: parameterSchema.optional(),
    customInstruction: parameterSchema.optional(),
    voiceInstruction: parameterSchema.optional(),
    xvecOnly: parameterSchema.optional(),
    chunkSize: parameterSchema.optional(),
    temperature: parameterSchema.optional(),
    topK: parameterSchema.optional(),
    repetitionPenalty: parameterSchema.optional(),
  })
  .catchall(parameterSchema);

const hfSpaceConfigSchema = z
  .object({
    space_id: z.string().min(1),
    api_name: z.string().min(1),
    timeout_ms: z.number().int().positive().optional(),
    space_url: z.string().min(1).optional(),
    input_images_format: z.enum(["file_array", "gallery"]).optional(),
    input_audio_format: z.enum(["file", "file_array"]).optional(),
  })
  .passthrough();

const codexCliConfigSchema = z
  .object({
    command: z.string().min(1),
    model_id: z.string().min(1),
    agent_model: z.string().min(1).optional(),
    timeout_ms: z.number().int().positive().optional(),
  })
  .passthrough();

export const codexBridgeConfigSchema = z
  .object({
    base_url_env: z.string().min(1),
    token_env: z.string().min(1),
    model_id: z.string().min(1),
    agent_model: z.string().min(1).optional(),
    timeout_ms: z.number().int().positive().optional(),
  })
  .strict();

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

const audioMetaSchema = z.object({
  model_id: z.string().min(1),
  default_speed: z.number().positive(),
  concurrent_limit: z.number().int().positive().nullable().optional(),
  supports_input_audio: z.boolean().optional(),
});

const baseModelSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["image", "video", "audio"]),
  key: z.string().min(1),
  label: z.string().min(1),
  vendor: z.string().min(1),
  provider: z.enum(["hf_space", "codex_cli", "codex_bridge"]),
  providerConfig: z.union([
    hfSpaceConfigSchema,
    codexCliConfigSchema,
    codexBridgeConfigSchema,
  ]),
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

const imageHfSpaceModelSchema = imageModelSchema.extend({
  provider: z.literal("hf_space"),
  providerConfig: hfSpaceConfigSchema,
});

const imageCodexCliModelSchema = imageModelSchema.extend({
  provider: z.literal("codex_cli"),
  providerConfig: codexCliConfigSchema,
});

const imageCodexBridgeModelSchema = imageModelSchema.extend({
  provider: z.literal("codex_bridge"),
  providerConfig: codexBridgeConfigSchema,
});

const imageModelProviderSchema = z.union([
  imageHfSpaceModelSchema,
  imageCodexCliModelSchema,
  imageCodexBridgeModelSchema,
]);

const videoModelSchema = baseModelSchema.extend({
  type: z.literal("video"),
  provider: z.literal("hf_space"),
  providerConfig: hfSpaceConfigSchema,
  parameters: videoParametersSchema,
  meta: videoMetaSchema,
});

const audioModelSchema = baseModelSchema.extend({
  type: z.literal("audio"),
  provider: z.literal("hf_space"),
  providerConfig: hfSpaceConfigSchema,
  parameters: audioParametersSchema,
  meta: audioMetaSchema,
});

const baseModelInputSchema = z.object({
  type: z.enum(["image", "video", "audio"]),
  key: z.string().min(1),
  label: z.string().min(1),
  vendor: z.string().min(1),
  provider: z.enum(["hf_space", "codex_cli", "codex_bridge"]),
  providerConfig: z.union([
    hfSpaceConfigSchema,
    codexCliConfigSchema,
    codexBridgeConfigSchema,
  ]),
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

const imageHfSpaceModelInputSchema = imageModelInputSchema.extend({
  provider: z.literal("hf_space"),
  providerConfig: hfSpaceConfigSchema,
});

const imageCodexCliModelInputSchema = imageModelInputSchema.extend({
  provider: z.literal("codex_cli"),
  providerConfig: codexCliConfigSchema,
});

const imageCodexBridgeModelInputSchema = imageModelInputSchema.extend({
  provider: z.literal("codex_bridge"),
  providerConfig: codexBridgeConfigSchema,
});

const imageModelProviderInputSchema = z.union([
  imageHfSpaceModelInputSchema,
  imageCodexCliModelInputSchema,
  imageCodexBridgeModelInputSchema,
]);

const videoModelInputSchema = baseModelInputSchema.extend({
  type: z.literal("video"),
  provider: z.literal("hf_space"),
  providerConfig: hfSpaceConfigSchema,
  parameters: videoParametersSchema,
  meta: videoMetaSchema,
});

const audioModelInputSchema = baseModelInputSchema.extend({
  type: z.literal("audio"),
  provider: z.literal("hf_space"),
  providerConfig: hfSpaceConfigSchema,
  parameters: audioParametersSchema,
  meta: audioMetaSchema,
});

export const modelCatalogSchema = z.array(
  z.union([imageModelProviderSchema, videoModelSchema, audioModelSchema]),
);

export const modelCatalogInputSchema = z.union([
  imageModelProviderInputSchema,
  videoModelInputSchema,
  audioModelInputSchema,
]);

export type ModelCatalogItem = z.infer<typeof modelCatalogSchema>[number];
export type ImageModelCatalogItem = z.infer<typeof imageModelProviderSchema>;
export type VideoModelCatalogItem = z.infer<typeof videoModelSchema>;
export type AudioModelCatalogItem = z.infer<typeof audioModelSchema>;
export type ModelCatalogType = ModelCatalogItem["type"];
export type ModelCatalogInput = z.infer<typeof modelCatalogInputSchema>;
export type CodexBridgeProviderConfig = z.infer<
  typeof codexBridgeConfigSchema
>;

export type ModelCatalogParams = {
  includeInactive?: boolean;
  includeDefaults?: boolean;
};
