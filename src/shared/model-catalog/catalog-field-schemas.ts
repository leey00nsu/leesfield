import { z } from "zod";
import { MAX_FILE_INPUT_LIMIT } from "./file-input-limits";
import { jsonValueSchema, gradioContractSchema, gradioStateSchema } from "./gradio-contract";
import { attachmentRelationshipSchema } from "./attachment-relationships";

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
    kind: z
      .enum(["string", "number", "boolean", "file", "files", "gallery", "json"])
      .optional(),
    schema: z.record(z.string(), z.unknown()).optional(),
    nullable: z.boolean().optional(),
    choiceMode: z.enum(["single", "multiple"]).optional(),
    allowCustomValue: z.boolean().optional(),
    maxChoices: z.number().int().nonnegative().optional(),
    allowEmpty: z.boolean().optional(),
    component: z.string().optional(),
    media: z.enum(["image", "video", "audio"]).optional(),
    fileLimit: z.number().int().min(1).max(MAX_FILE_INPUT_LIMIT).optional(),
  })
  .strict();

export const parameterSchema = z
  .object({
    ui: z.enum(parameterUiOptions),
    label: z.string().optional(),
    required: z.boolean().optional(),
    attachment: attachmentRelationshipSchema.nullable().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    maxItems: z.number().int().min(1).max(MAX_FILE_INPUT_LIMIT).optional(),
    step: z.number().optional(),
    default: jsonValueSchema.optional(),
    options: z.array(parameterOptionInputSchema).optional(),
    binding: hfParameterBindingSchema.optional(),
  })
  .passthrough();

export const imageParametersSchema = z
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

export const videoParametersSchema = z
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

export const audioParametersSchema = z
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

export const hfSpaceConfigSchema = z
  .object({
    space_id: z.string().min(1),
    input_rules: z.record(z.string(), z.unknown()).optional(),
    gradio_contract: gradioContractSchema.optional(),
    gradio_state: gradioStateSchema.optional(),
    api_name: z.string().min(1),
    timeout_ms: z.number().int().positive().optional(),
    space_url: z.string().min(1).optional(),
    input_images_format: z.enum(["file_array", "gallery"]).optional(),
    input_audio_format: z.enum(["file", "file_array"]).optional(),
  })
  .passthrough();

export const codexCliConfigSchema = z
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

export const backgroundRemovalCapabilitySchema = z
  .object({
    version: z.number().int().positive().default(1),
    api_name: z.string().trim().min(1),
    input_parameter: z.string().trim().min(1).default("image"),
    output_mime_type: z.literal("image/png").default("image/png"),
  })
  .strict();

export const imageMetaSchema = z.object({
  pipeline: z.string().min(1),
  model_id: z.string().min(1),
  default_width: z.number().int().positive(),
  default_height: z.number().int().positive(),
  default_steps: z.number().int().positive(),
  concurrent_limit: z.number().int().positive().nullable().optional(),
  max_input_images: z.number().int().nonnegative(),
  operations: z
    .object({
      background_removal: backgroundRemovalCapabilitySchema.optional(),
    })
    .strict()
    .optional(),
});

export const videoMetaSchema = z.object({
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

export const audioMetaSchema = z.object({
  model_id: z.string().min(1),
  default_speed: z.number().positive(),
  concurrent_limit: z.number().int().positive().nullable().optional(),
  supports_input_audio: z.boolean().optional(),
});
