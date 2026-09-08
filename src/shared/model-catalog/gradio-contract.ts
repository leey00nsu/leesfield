import { gradioSchemaValidator, gradioSchemaContainsFileData } from "./gradio-json-schema";

import { z } from "zod";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string(),
  z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema),
]));
export const formJsonValueSchema: z.ZodType<string | number | boolean | null | unknown[] | Record<string, unknown>> = jsonValueSchema;
const safeKey = z.string().min(1).refine(v => !["__proto__", "prototype", "constructor"].includes(v));
export const gradioFieldSchema = z.object({
  ui: z.string().optional(),
  component: z.string().optional(),
  hidden: z.boolean().optional(),
  confirmed: z.boolean().optional(),
  name: safeKey,
  label: z.string(),
  schema: z.record(z.string(), z.unknown()),
  kind: z.enum(["string", "number", "boolean", "file", "files", "gallery", "json"]),
  required: z.boolean(),
  nullable: z.boolean(),
  default: jsonValueSchema.optional(),
  canonical: z.enum(["prompt"]).optional(),
  media: z.enum(["image", "video", "audio"]).optional(),
  choices: z.array(z.union([z.string(), z.number()])).optional(),
  min: z.number().optional(), max: z.number().optional(), step: z.number().positive().optional(),
}).strict();
export const gradioContractSchema = z.object({
  requiresSession: z.boolean().optional(),
  mappingConfirmed: z.boolean().optional(),
  version: z.literal(1),
  apiName: z.string().regex(/^\/[^\s]+$/),
  inputs: z.array(gradioFieldSchema),
  output: z.object({
    media: z.enum(["image", "video", "audio"]),
    path: z.array(z.union([safeKey, z.number().int().nonnegative()])).max(12),
    multiple: z.boolean().default(false),
  }).strict().nullable(),
  diagnostics: z.array(z.string()),
  reviewed: z.boolean().default(false),
}).strict().superRefine((c, ctx) => {
  if (new Set(c.inputs.map(p => p.name)).size !== c.inputs.length)
    ctx.addIssue({ code: "custom", message: "Duplicate Gradio parameter names" });
  if (c.inputs.filter(p => p.canonical === "prompt").length > 1)
    ctx.addIssue({ code: "custom", message: "Duplicate prompt binding" });
});
export type GradioContract = z.infer<typeof gradioContractSchema>;
export type GradioField = GradioContract["inputs"][number];

type MappedModel = { providerConfig?: unknown; parameters?: unknown };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Convert old stored contracts once at the read/save boundary; no database writes. */
export function normalizeGradioModel<T extends MappedModel>(model: T): T {
  const config = object(model.providerConfig);
  if (config.gradio_contract === undefined) return model;
  const contract = gradioContractSchema.parse(config.gradio_contract);
  const parameters = { ...object(model.parameters) };
  for (const [order, field] of contract.inputs.entries()) {
    const existingKey = Object.keys(parameters).find(key => object(object(parameters[key]).binding).parameterName === field.name);
    const key = existingKey ?? field.canonical ?? field.name;
    const parameter = { ...object(parameters[key]) };
    if (parameter.default === undefined) delete parameter.default;
    for (const attr of ["options", "min", "max", "step"]) delete parameter[attr];
    Object.assign(parameter, {
      ui: field.hidden ? "hidden" : parameter.ui ?? (field.choices?.length ? "select" : ["file", "files", "gallery"].includes(field.kind) ? "upload" : field.kind === "boolean" ? "toggle" : field.kind === "number" ? "input" : "textarea"),
      label: field.label,
      required: field.required,
      binding: {
        source: "hf_space", parameterName: field.name, order,
        valueType: ["string", "number", "boolean", "file"].includes(field.kind) ? field.kind : "string",
        kind: field.kind, schema: field.schema, nullable: field.nullable,
        ...(field.component ? { component: field.component } : {}),
        ...(field.canonical ? { canonicalKey: field.canonical } : object(parameter.binding).canonicalKey ? { canonicalKey: object(parameter.binding).canonicalKey } : {}),
        ...(field.media ? { media: field.media } : {}),
      },
    });
    if (Object.prototype.hasOwnProperty.call(field, "default")) parameter.default = field.default;
    if (field.choices) parameter.options = field.choices.map(value => ({ label: String(value), value }));
    for (const attr of ["min", "max", "step"] as const) if (field[attr] !== undefined) parameter[attr] = field[attr];
    parameters[key] = parameter;
  }
  const providerConfig: Record<string, unknown> = { ...config, api_name: contract.apiName, output: contract.output };
  delete providerConfig.gradio_contract;
  return { ...model, providerConfig, parameters };
}

/** Build transient execution metadata from the same settings the administrator edits. */
export function getGradioContract(model: MappedModel): GradioContract | null {
  const normalized = normalizeGradioModel(model);
  const config = object(normalized.providerConfig);
  if (!Object.prototype.hasOwnProperty.call(config, "output")) return null;
  const inputs = Object.entries(object(normalized.parameters))
    .filter(([, parameter]) => object(object(parameter).binding).source === "hf_space")
    .sort(([, a], [, b]) => Number(object(object(a).binding).order) - Number(object(object(b).binding).order))
    .map(([, parameter]) => {
      const p = object(parameter), b = object(p.binding);
      return {
        name: b.parameterName, label: p.label ?? b.parameterName,
        schema: b.schema ?? {}, kind: b.kind ?? b.valueType, ui: p.ui,
        nullable: b.nullable ?? false, required: p.required ?? false,
        hidden: p.ui === "hidden",
        ...(b.component ? { component: b.component } : {}),
        ...(b.canonicalKey === "prompt" ? { canonical: "prompt" } : {}),
        ...(b.media ? { media: b.media } : {}),
        ...(p.default !== undefined ? { default: p.default } : {}),
        ...(Array.isArray(p.options) ? { choices: p.options.map(option => typeof option === "object" && option !== null ? Array.isArray(option) ? option[1] : object(option).value : option) } : {}),
        ...(p.min !== undefined ? { min: p.min } : {}),
        ...(p.max !== undefined ? { max: p.max } : {}),
        ...(p.step !== undefined ? { step: p.step } : {}),
      };
    });
  return gradioContractSchema.parse({ version: 1, apiName: config.api_name, inputs, output: config.output, diagnostics: [] });
}
export function gradioInputValues(contract: GradioContract, values: { prompt?: string; dynamicParams?: Record<string, unknown> }) {
  const result: Record<string, unknown> = {};
  const known = new Set(contract.inputs.map(p => p.name));
  for (const key of Object.keys(values.dynamicParams ?? {}))
    if (!known.has(key)) throw new Error("HF_CONTRACT_UNKNOWN_PARAMETER:" + key);
  for (const field of contract.inputs) {
    const explicit = Object.prototype.hasOwnProperty.call(values.dynamicParams ?? {}, field.name);
    const value = explicit ? values.dynamicParams?.[field.name]
      : field.canonical === "prompt" && values.prompt !== undefined ? values.prompt : field.default;
    if (value === undefined) {
      if (field.required) throw new Error("HF_CONTRACT_REQUIRED:" + field.name);
      continue;
    }
    if (value === null) {
      if (!field.nullable) throw new Error("HF_CONTRACT_NOT_NULLABLE:" + field.name);
    } else {
      const valid = field.kind === "number" ? typeof value === "number" && Number.isFinite(value)
        : field.kind === "boolean" ? typeof value === "boolean"
        : field.kind === "files" || field.kind === "gallery" ? Array.isArray(value) && value.every(v => typeof v === "string")
        : field.kind === "json" ? jsonValueSchema.safeParse(value).success
        : typeof value === "string";
      if (!valid) throw new Error("HF_CONTRACT_TYPE:" + field.name);
      if (field.choices?.length && !field.choices.includes(value as string | number))
        throw new Error("HF_CONTRACT_CHOICE:" + field.name);
      if (typeof value === "number" && ((field.min !== undefined && value < field.min) ||
        (field.max !== undefined && value > field.max) ||
        (field.step && Math.abs((value - (field.min ?? 0)) / field.step - Math.round((value - (field.min ?? 0)) / field.step)) > 1e-6)))
        throw new Error("HF_CONTRACT_RANGE:" + field.name);
      if (field.kind === "json") validateJsonSchema(value, field.schema, field.name);
      else if (["string","number","boolean"].includes(field.kind)) validateJsonSchema(value, field.schema, field.name);
      if (field.schema.type === "integer" && !Number.isInteger(value))
        throw new Error("HF_CONTRACT_INTEGER:" + field.name);
    }
    result[field.name] = value;
  }
  return result;
}

function validateJsonSchema(value: unknown, schema: Record<string, unknown>, name: string) {
 let validate;
 try { validate=gradioSchemaValidator(schema); } catch { throw new Error("HF_CONTRACT_MAPPING_LIMITED:" + name); }
 if(!validate(value)) throw new Error("HF_CONTRACT_SCHEMA:" + name + ":" + (validate.errors?.[0]?.keyword??"invalid"));
}
export function selectGradioOutput(data: unknown, contract: GradioContract) {
  if (!contract.output) throw new Error("HF_CONTRACT_OUTPUT_UNRESOLVED");
  let value = data;
  for (const key of contract.output.path) {
    if (!value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, key))
      throw new Error("HF_CONTRACT_OUTPUT_MISSING");
    value = (value as Record<string | number, unknown>)[key];
  }
  if (value == null) throw new Error("HF_CONTRACT_OUTPUT_MISSING");
  return value;
}



export type GradioSupport = {
 status: "auto_mapped" | "needs_configuration" | "mapping_limited" | "unsupported";
 blockers: string[];
 corrections: string[];
 limitations: string[];
 execution: "not_run";
};
export function assessGradioSupport(contract: GradioContract): GradioSupport {
 const blockers:string[]=[],corrections:string[]=[],limitations:string[]=[];
 // An event chain or an endpoint name alone does not prove session dependence.
 if(contract.inputs.some(f=>f.component?.toLowerCase()==="state")) blockers.push("SESSION_STATE_INPUT");
 if(!contract.output) corrections.push("OUTPUT_MEDIA_UNRESOLVED");
 for(const f of contract.inputs) {
  if(f.kind==="json"&&gradioSchemaContainsFileData(f.schema)) limitations.push("NESTED_FILE_CONVERSION:"+f.name);
  if(!["file","files","gallery"].includes(f.kind)) {
   if(!Object.keys(f.schema).length) limitations.push("INPUT_SCHEMA_MISSING:"+f.name);
   else {
    try {gradioSchemaValidator(f.schema);} catch {limitations.push("SCHEMA_MAPPING_LIMIT:"+f.name);}
   }
  }
  if(Object.prototype.hasOwnProperty.call(f,"default")) {
   try {gradioInputValues({...contract,inputs:[{...f,canonical:undefined}]},{});}
   catch {limitations.push("DEFAULT_SCHEMA_CONFLICT:"+f.name);}
  }
 }

 return {status:blockers.length?"unsupported":limitations.length?"mapping_limited":corrections.length?"needs_configuration":"auto_mapped",blockers,corrections,limitations,execution:"not_run"};
}
export function assertGradioExecutable(contract: GradioContract) {
 const support=assessGradioSupport(contract);
 if(support.status==="unsupported") throw new Error("HF_CONTRACT_UNSUPPORTED:"+support.blockers.join(","));
 if(support.status==="mapping_limited") throw new Error("HF_CONTRACT_MAPPING_LIMITED:"+support.limitations.join(","));
 if(support.status==="needs_configuration") throw new Error("HF_CONTRACT_CONFIGURATION_REQUIRED:"+support.corrections.join(","));

}
