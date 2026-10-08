import { z } from "zod";
import type { SchemaObject } from "openapi3-ts/oas31";
import { externalAdminModelCreateSchema } from "@/shared/api/platform-admin-contract";
import {
  parameterSchema, imageParametersSchema, videoParametersSchema, audioParametersSchema,
  imageMetaSchema, videoMetaSchema, audioMetaSchema,
  hfSpaceConfigSchema, codexCliConfigSchema, codexBridgeConfigSchema,
} from "@/shared/model-catalog/catalog-field-schemas";
import { gradioContractSchema, gradioFieldSchema } from "@/shared/model-catalog/gradio-contract";
import { modalConfigSchema } from "@/shared/model-catalog/modal-comfyui-contract";

// JSON defaults are unrestricted JSON values; avoid recursive schema references
// in the self-contained request branches.
const documentedParameter = parameterSchema.extend({ default: z.unknown().optional() });
const documentedContract = z.object({
  ...gradioContractSchema.shape,
  inputs: z.array(gradioFieldSchema.extend({ default: z.unknown().optional() })),
}).strict();
const hfConfig = hfSpaceConfigSchema.extend({ gradio_contract: documentedContract.optional() });
const metadata = { image: imageMetaSchema, video: videoMetaSchema, audio: audioMetaSchema };
const parameters = { image: imageParametersSchema, video: videoParametersSchema, audio: audioParametersSchema };
const common = externalAdminModelCreateSchema.omit({ apiKey: true }).shape;
const branches: z.ZodType[] = [];
for (const type of ["image", "video", "audio"] as const) {
  const legacyParameters = z.object(Object.fromEntries(
    Object.entries(parameters[type].shape).map(([name, field]) => [
      name, field.isOptional() ? documentedParameter.optional() : documentedParameter,
    ]),
  )).catchall(documentedParameter);
  const legacy = { parameters: legacyParameters, meta: metadata[type] };
  branches.push(z.object({ ...common, ...legacy, type: z.literal(type),
    provider: z.literal("hf_space"), providerConfig: hfConfig }).strict());
  branches.push(z.object({ ...common, type: z.literal(type), provider: z.literal("hf_space"),
    providerConfig: hfConfig.extend({ gradio_contract: documentedContract }),
    parameters: z.record(z.string(), documentedParameter), meta: metadata[type].partial(),
  }).strict());
  if (type !== "audio") branches.push(z.object({ ...common, type: z.literal(type),
    provider: z.literal("modal_comfyui"), providerConfig: modalConfigSchema,
    parameters: z.record(z.string(), documentedParameter), meta: metadata[type].partial(),
  }).strict());
  if (type === "image") for (const [provider, config] of [
    ["codex_cli", codexCliConfigSchema], ["codex_bridge", codexBridgeConfigSchema],
  ] as const) branches.push(z.object({ ...common, ...legacy, type: z.literal(type),
    provider: z.literal(provider), providerConfig: config }).strict());
}
const llm = z.object({ ...common, type: z.literal("llm"), provider: z.literal("openai_compatible"),
  providerConfig: z.object({
    base_url: z.string().url().max(2048).describe("Public HTTP(S) base URL; no query or fragment."),
    model_id: z.string().trim().min(1).max(256), supports_images: z.boolean(),
    timeout_ms: z.number().int().min(1000).max(120000).optional(),
  }).strict(), parameters: z.object({}).strict(), meta: z.object({}).strict(),
});
const credential = externalAdminModelCreateSchema.shape.apiKey.unwrap();
branches.push(llm.extend({ isActive: z.literal(false), apiKey: credential.optional() }).strict());
branches.push(llm.extend({ isActive: z.literal(true).optional(), apiKey: credential }).strict());

export const modelRegistrationExample = {
  type: "audio", key: "example-audio", label: "Example audio", vendor: "Example",
  provider: "hf_space", providerConfig: { space_id: "example/audio", api_name: "/predict" },
  parameters: { prompt: { ui: "textarea", required: true } },
  meta: { model_id: "example-audio", default_speed: 1 },
};

export function getModelRegistrationDocumentationSchema() {
  // Zod attaches non-enumerable ~standard methods. Copy only JSON properties
  // because this schema is also passed to the documentation's Client Components.
  const schema = { ...z.toJSONSchema(z.union(branches), {
    io: "input", unrepresentable: "any",
  }) };
  delete schema.$schema;
  return externalAdminModelCreateSchema.openapi({
    allOf: [schema as SchemaObject], example: modelRegistrationExample,
  });
}
