import { modalConfigSchema } from "@/shared/model-catalog/modal-comfyui-contract";
import { parameterConfigurationIssues } from "@/shared/model-catalog/parameter-contract";
import {
  getGradioContract,
  normalizeGradioModel,
  assertGradioExecutable,
} from "@/shared/model-catalog/gradio-contract";
import { z } from "zod";
import { validateRemoteUrl } from "@/server/http/safe-remote";

import { parameterSchema, imageParametersSchema, videoParametersSchema, audioParametersSchema, hfSpaceConfigSchema, codexCliConfigSchema, codexBridgeConfigSchema, imageMetaSchema, videoMetaSchema, audioMetaSchema } from "@/shared/model-catalog/catalog-field-schemas";
export { codexBridgeConfigSchema, backgroundRemovalCapabilitySchema } from "@/shared/model-catalog/catalog-field-schemas";

export const llmProviderConfigSchema = z.object({
  base_url: z.string().trim().min(1).max(2048).refine((value) => {
    try {
      const url = validateRemoteUrl(value);
      return !url.search && !url.hash && ![".local", ".internal"].some((suffix) => url.hostname.endsWith(suffix));
    } catch { return false; }
  }, "LLM_BASE_URL_BLOCKED"),
  model_id: z.string().trim().min(1).max(256),
  supports_images: z.boolean(),
  timeout_ms: z.number().int().min(1_000).max(120_000).optional(),
}).strict();

const llmModelSchema = z.object({
  id: z.string().min(1),
  type: z.literal("llm"),
  key: z.string().min(1),
  label: z.string().min(1),
  vendor: z.string().min(1),
  provider: z.literal("openai_compatible"),
  providerConfig: llmProviderConfigSchema,
  parameters: z.object({}).strict(),
  meta: z.object({}).strict(),
  hasApiKey: z.boolean().optional(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const llmModelInputSchema = llmModelSchema.omit({ id: true, createdAt: true, updatedAt: true, hasApiKey: true })
  .extend({ isActive: z.boolean().optional(), isDefault: z.boolean().optional() });

const baseModelSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["image", "video", "audio"]),
  key: z.string().min(1),
  label: z.string().min(1),
  vendor: z.string().min(1),
  provider: z.enum(["hf_space", "codex_cli", "codex_bridge", "modal_comfyui"]),
  providerConfig: z.union([
    hfSpaceConfigSchema,
    codexCliConfigSchema,
    codexBridgeConfigSchema,
    modalConfigSchema,
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
  parameters: imageParametersSchema.partial().catchall(parameterSchema),
  meta: imageMetaSchema.partial(),
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
  imageModelSchema.extend({provider:z.literal("modal_comfyui"),providerConfig:modalConfigSchema}),
]);

const videoHfModelSchema = baseModelSchema.extend({
  type: z.literal("video"),
  provider: z.literal("hf_space"),
  providerConfig: hfSpaceConfigSchema,
  parameters: videoParametersSchema.partial().catchall(parameterSchema),
  meta: videoMetaSchema.partial(),
});

const videoModelSchema = z.union([videoHfModelSchema, videoHfModelSchema.extend({provider:z.literal("modal_comfyui"),providerConfig:modalConfigSchema})]);

const audioModelSchema = baseModelSchema.extend({
  type: z.literal("audio"),
  provider: z.literal("hf_space"),
  providerConfig: hfSpaceConfigSchema,
  parameters: audioParametersSchema.partial().catchall(parameterSchema),
  meta: audioMetaSchema.partial(),
});

const baseModelInputSchema = z.object({
  type: z.enum(["image", "video", "audio"]),
  key: z.string().min(1),
  label: z.string().min(1),
  vendor: z.string().min(1),
  provider: z.enum(["hf_space", "codex_cli", "codex_bridge", "modal_comfyui"]),
  providerConfig: z.union([
    hfSpaceConfigSchema,
    codexCliConfigSchema,
    codexBridgeConfigSchema,
    modalConfigSchema,
  ]),
  parameters: z.unknown(),
  meta: z.unknown(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

const imageModelInputSchema = baseModelInputSchema.extend({
  type: z.literal("image"),
  parameters: imageParametersSchema.partial().catchall(parameterSchema),
  meta: imageMetaSchema.partial(),
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
  imageModelInputSchema.extend({provider:z.literal("modal_comfyui"),providerConfig:modalConfigSchema}),
]);

const videoHfModelInputSchema = baseModelInputSchema.extend({
  type: z.literal("video"),
  provider: z.literal("hf_space"),
  providerConfig: hfSpaceConfigSchema,
  parameters: videoParametersSchema.partial().catchall(parameterSchema),
  meta: videoMetaSchema.partial(),
});

const videoModelInputSchema = z.union([videoHfModelInputSchema, videoHfModelInputSchema.extend({provider:z.literal("modal_comfyui"),providerConfig:modalConfigSchema})]);

const audioModelInputSchema = baseModelInputSchema.extend({
  type: z.literal("audio"),
  provider: z.literal("hf_space"),
  providerConfig: hfSpaceConfigSchema,
  parameters: audioParametersSchema.partial().catchall(parameterSchema),
  meta: audioMetaSchema.partial(),
});

const normalizeStoredModel = (value: unknown) => {
  try {
    return value && typeof value === "object"
      ? normalizeGradioModel(
          value as { providerConfig?: unknown; parameters?: unknown },
        )
      : value;
  } catch {
    return value;
  } // Let the schema report invalid legacy data as a validation error.
};

function validateLegacyModel(model: { type: "image" | "video" | "audio" | "llm"; providerConfig: unknown; parameters: unknown; meta: unknown }, ctx: z.RefinementCtx) {
  if (model.type === "llm") return;
  try { if (getGradioContract(model)) return; } catch { return; }
  const schemas = { image: [imageParametersSchema, imageMetaSchema], video: [videoParametersSchema, videoMetaSchema], audio: [audioParametersSchema, audioMetaSchema] } as const;
  for (const [index, key] of (["parameters", "meta"] as const).entries()) {
    const parsed = schemas[model.type][index].safeParse(model[key]);
    if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", path: [key, ...issue.path], message: issue.message });
  }
}

export const modelCatalogSchema = z.array(
  z.preprocess(
    normalizeStoredModel,
    z.union([imageModelProviderSchema, videoModelSchema, audioModelSchema, llmModelSchema]).superRefine(validateLegacyModel),
  ),
);

export const modelCatalogInputSchema = z.preprocess(
  normalizeStoredModel,
  z
    .union([
      imageModelProviderInputSchema,
      videoModelInputSchema,
      audioModelInputSchema,
      llmModelInputSchema,
    ])
    .superRefine((model, ctx) => {
      validateLegacyModel(model, ctx);
      // Modal defaults (including null/objects) are checked against their source
      // JSON Schema below; legacy scalar inference is not its input contract.
      if(model.provider!=="modal_comfyui" && model.provider!=="openai_compatible") for (const issue of parameterConfigurationIssues(model.parameters)) ctx.addIssue({code:"custom",path:["parameters",issue.name],message:"Invalid parameter configuration: "+issue.reason});
      if (model.provider !== "hf_space" && model.provider !== "modal_comfyui") return;
      try {
        const contract = getGradioContract(model);
        if (contract && (model.isActive !== false || model.provider === "modal_comfyui")) {
          assertGradioExecutable(contract);
          if (contract.output?.media !== model.type)
            throw new Error("HF_CONTRACT_MEDIA");
        }
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          path: ["providerConfig"],
          message:
            error instanceof Error ? error.message : "HF_MAPPING_INVALID",
        });
      }
    }),
);

export type ModelCatalogItem = z.infer<typeof modelCatalogSchema>[number];
export type ImageModelCatalogItem = z.infer<typeof imageModelProviderSchema>;
export type VideoModelCatalogItem = z.infer<typeof videoModelSchema>;
export type AudioModelCatalogItem = z.infer<typeof audioModelSchema>;
export type LlmModelCatalogItem = z.infer<typeof llmModelSchema>;
export type ModelCatalogType = ModelCatalogItem["type"];
export type ModelCatalogInput = z.infer<typeof modelCatalogInputSchema>;
export type CodexBridgeProviderConfig = z.infer<typeof codexBridgeConfigSchema>;

export type ModelCatalogParams = {
  includeInactive?: boolean;
  includeDefaults?: boolean;
};
