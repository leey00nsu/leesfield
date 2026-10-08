import "./platform-contract";
import { z } from "zod";
import { modalWorkflowIdSchema, modalExecutionLimitsSchema } from "@/shared/model-catalog/modal-comfyui-contract";
export const externalAdminModelQuerySchema = z.object({
  type: z.enum(["image", "video", "audio", "llm"]).optional(), q: z.string().max(200).optional(),
  includeInactive: z.enum(["true", "false", "0", "1"]).optional(),
});
const fields = {
  type: z.enum(["image", "video", "audio", "llm"]), key: z.string().min(1),
  label: z.string().min(1), vendor: z.string().min(1),
  provider: z.enum(["hf_space", "codex_cli", "codex_bridge", "modal_comfyui", "openai_compatible"]),
  providerConfig: z.record(z.string(), z.unknown()), parameters: z.record(z.string(), z.unknown()),
  meta: z.record(z.string(), z.unknown()), isActive: z.boolean(), isDefault: z.boolean(),
};
export const externalAdminModelCreateSchema = z.object({
  ...fields, isActive: fields.isActive.optional(), isDefault: fields.isDefault.optional(),
  apiKey: z.string().trim().min(1).max(8192).optional().describe("Write-only LLM credential. Never returned.").openapi({ writeOnly: true }),
}).strict();
export const externalAdminModelUpdateSchema = externalAdminModelCreateSchema.partial().strict()
  .openapi({ example: { label: "Updated model", isActive: false } });
export const externalAdminModelSchema = z.object({
  ...fields, id: z.string(), hasApiKey: z.boolean().optional(), createdAt: z.string(), updatedAt: z.string(),
});
export const externalAdminModelListSchema = z.object({ items: z.array(externalAdminModelSchema) });
export const externalAdminHfImportSchema = z.object({ spaceUrl: z.string().min(1).max(2048), apiName: z.string().max(200).optional() }).strict();
export const externalAdminModalImportSchema = z.object({
  workflowId: modalWorkflowIdSchema, limits: modalExecutionLimitsSchema.partial().optional(),
  timeoutMs: z.number().int().min(1000).max(86400000).optional(),
}).strict();
export const externalAdminDraftSchema = externalAdminModelCreateSchema.omit({ apiKey: true });
export const externalAdminHfImportResponseSchema = z.object({
  support: z.unknown(), spaceId: z.string(), apiNames: z.array(z.string()), resolvedApiName: z.string(),
  draft: externalAdminDraftSchema, warnings: z.array(z.string()),
});
export const externalAdminModalListSchema = z.object({ items: z.array(z.object({
  id: z.string(), name: z.string(), type: z.string(), supported: z.boolean(), message: z.string().nullable(),
  limits: modalExecutionLimitsSchema.optional(),
})) });
export const externalAdminModalImportResponseSchema = z.object({ draft: externalAdminDraftSchema });
