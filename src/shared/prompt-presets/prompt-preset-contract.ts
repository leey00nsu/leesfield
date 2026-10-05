import { z } from "zod";

export const promptPresetKeySchema = z.string().regex(/^[a-z][a-z0-9-]{0,119}$/);
export const promptPresetModalitySchema = z.enum(["image", "video", "audio"]);
export const promptPresetPromptSchema = z.string().max(20_000).refine(
  (value) => value.trim().length > 0, "프롬프트를 입력하세요.",
);
export const promptPresetRequiredInputsSchema = z.object({
  referenceImageCount: z.number().int().min(0).max(1).default(0),
}).strict();
export const promptPresetRecommendationsSchema = z.object({
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"]).optional(),
  imageCount: z.number().int().min(1).max(8).optional(),
}).strict();
export const promptPresetRefSchema = z.object({
  key: promptPresetKeySchema,
  revision: z.number().int().positive(),
  builtinRevision: z.number().int().positive().optional(),
  requiredInputs: promptPresetRequiredInputsSchema,
  recommendedParameters: promptPresetRecommendationsSchema,
}).strict();
export type PromptPresetRef = z.infer<typeof promptPresetRefSchema>;
export const promptPresetWorkStateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  appliedPrompt: promptPresetPromptSchema,
  userText: z.string().max(20_000).optional(),
  tokenOffset: z.number().int().min(0).max(20_000).optional(),
}).strict();
export type PromptPresetWorkState = z.infer<typeof promptPresetWorkStateSchema>;

export const builtinPromptPresetSchema = z.object({
  key: promptPresetKeySchema,
  revision: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1_000),
  modality: promptPresetModalitySchema,
  prompt: promptPresetPromptSchema,
  requiredInputs: promptPresetRequiredInputsSchema,
  recommendedParameters: promptPresetRecommendationsSchema,
}).strict();
export type BuiltinPromptPreset = z.infer<typeof builtinPromptPresetSchema>;
export type PromptPresetModality = z.infer<typeof promptPresetModalitySchema>;
export const promptPresetSchema = builtinPromptPresetSchema.extend({
  builtinKey: promptPresetKeySchema.nullable(),
  builtinRevision: z.number().int().positive().nullable(),
  defaultPrompt: promptPresetPromptSchema.nullable(),
  isActive: z.boolean(),
  isModified: z.boolean(),
}).strict();
export type PromptPreset = z.infer<typeof promptPresetSchema>;

export const createPromptPresetSchema = builtinPromptPresetSchema
  .omit({ revision: true }).strict();
export const updatePromptPresetSchema = z.object({
  expectedRevision: z.number().int().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(1_000).optional(),
  prompt: promptPresetPromptSchema.optional(),
  modality: promptPresetModalitySchema.optional(),
  requiredInputs: promptPresetRequiredInputsSchema.optional(),
  recommendedParameters: promptPresetRecommendationsSchema.optional(),
  isActive: z.boolean().optional(),
}).strict();
export const promptPresetRevisionSchema = z.object({
  expectedRevision: z.number().int().positive(),
}).strict();

export function promptPresetReference(preset: PromptPreset): PromptPresetRef {
  return {
    key: preset.key,
    revision: preset.revision,
    ...(preset.builtinRevision === null ? {} : { builtinRevision: preset.builtinRevision }),
    requiredInputs: preset.requiredInputs,
    recommendedParameters: preset.recommendedParameters,
  };
}
