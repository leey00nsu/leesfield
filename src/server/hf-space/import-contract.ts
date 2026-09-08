import { gradioSchemaValidator, resolveGradioSchema } from "@/shared/model-catalog/gradio-json-schema";

import type { GradioContract, GradioField, JsonValue } from "@/shared/model-catalog/gradio-contract";
import { jsonValueSchema } from "@/shared/model-catalog/gradio-contract";

type RecordValue = Record<string, unknown>;
const record = (v: unknown): RecordValue => v && typeof v === "object" && !Array.isArray(v) ? v as RecordValue : {};
export function gradioLabel(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  const obj = record(value);
  if (typeof obj.en === "string") return obj.en;
  if (typeof obj.ko === "string") return obj.ko;
  return Object.values(obj).find(v => typeof v === "string") as string | undefined ?? fallback;
}
function sourceSchema(parameter: RecordValue, component: RecordValue, direction: "input" | "output"): RecordValue {
  // view_api() replaces type with a display string. Config retains the raw schema.
  for (const candidate of [parameter.type, component[direction === "input" ? "api_info_as_input" : "api_info_as_output"], component.api_info]) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate) && Object.keys(candidate).length) return candidate as RecordValue;
  }
  return {};
}
function schemaNullable(s: RecordValue): boolean {
 try { return Object.keys(s).length>0 && gradioSchemaValidator(s)(null) === true; } catch {return false;}
}
function schemaKind(raw: RecordValue, component: string): GradioField["kind"] {
 const schema=resolveGradioSchema(raw);
 if(component==="gallery") return "gallery";
 if(["image","audio","video","file"].includes(component)) return schema.type==="array"?"files":"file";
 if(schema.title==="FileData" || String(schema.$ref??"").endsWith("/FileData")) return "file";
 if(schema.type==="array") {
  const item=resolveGradioSchema(record(schema.items),raw);
  if(item.title==="FileData"||String(item.$ref??"").endsWith("/FileData"))return "files";
 }
 const branches=[schema.anyOf,schema.oneOf].find(Array.isArray) as unknown[] | undefined;
 if(branches) {
  const nonNull=branches.map(v=>resolveGradioSchema(record(v),raw)).filter(v=>v.type!=="null");
  if(nonNull.length===1)return schemaKind(nonNull[0],component);
  return "json";
 }
 const types=(Array.isArray(schema.type)?schema.type:[schema.type]).filter(t=>t!=="null");
 if(types.length>1)return "json";
 const type=types[0];
 if(type==="number"||type==="integer")return "number";
 if(type==="boolean")return "boolean";
 if(type==="string")return "string";
 return "json";
}
export function buildImportContract(apiName: string, endpointValue: unknown, configValue: unknown): GradioContract {
  const endpoint = record(endpointValue), config = record(configValue);
  const components = Array.isArray(config.components) ? config.components.map(record) : [];
  const deps = Array.isArray(config.dependencies) ? config.dependencies.map(record) : [];
  const dep = deps.find(d => typeof d.api_name === "string" && "/" + d.api_name.replace(/^\//, "") === apiName);
  const inputIds = Array.isArray(dep?.inputs) ? dep.inputs : [];
  const outputIds = Array.isArray(dep?.outputs) ? dep.outputs : [];
  const diagnostics: string[] = [];
  const inputs: GradioField[] = (Array.isArray(endpoint.parameters) ? endpoint.parameters : []).map((raw, i) => {
    const p = record(raw), c = components.find(c => c.id === inputIds[i]) ?? {};
    const props = record(c.props);
    const name = typeof p.parameter_name === "string" ? p.parameter_name : "param_" + i;
    const label = gradioLabel(props.label, gradioLabel(p.label, name));
    const component = String(c.type ?? p.component ?? "").toLowerCase();
    const schema = sourceSchema(p, c, "input");
    const kind = schemaKind(schema, component);
    const nullable = schemaNullable(schema) || (["file","files","gallery"].includes(kind) && p.parameter_has_default === true && p.parameter_default === null);
    const hasDefault = p.parameter_has_default === true;
    const defaultValue = hasDefault ? p.parameter_default : undefined;
    const parsedDefault = jsonValueSchema.safeParse(defaultValue);
    const choiceValues = Array.isArray(props.choices) ? props.choices.map(v => Array.isArray(v) ? v[1] : v)
      : Array.isArray(schema.enum) ? schema.enum : undefined;
    const choices = choiceValues?.filter((v): v is string | number => typeof v === "string" || typeof v === "number");
    const canonical = kind === "string" && !choices?.length &&
      /^(prompt|text|target_text|gen_text|input_text)$/i.test(name) ? "prompt" as const : undefined;
    const inferredPrompt = kind === "string" && !choices?.length && /^prompt$/i.test(label) ? "prompt" as const : undefined;
    if (!Object.keys(schema).length) diagnostics.push("SCHEMA_MISSING:" + name);
    if (component === "state") diagnostics.push("SESSION_STATE_INPUT:" + name);

    if (/optional/i.test(label) && !nullable && !hasDefault) diagnostics.push("OPTIONAL_LABEL_REVIEW:" + name);
    const media = ["image", "audio", "video"].includes(component) ? component as "image" | "audio" | "video" : undefined;
    return { component, hidden: p.hidden === true, name, label, schema, kind, required: !hasDefault, nullable,
      ...(parsedDefault.success ? { default: parsedDefault.data as JsonValue } : {}),
      ...((canonical ?? inferredPrompt) ? { canonical: canonical ?? inferredPrompt } : {}),
      ...(media ? { media } : {}), ...(choices?.length ? { choices } : {}),
      ...(typeof props.minimum === "number" ? { min: props.minimum } : {}),
      ...(typeof props.maximum === "number" ? { max: props.maximum } : {}),
      ...(typeof props.step === "number" && props.step > 0 ? { step: props.step } : {}),
    };
  });
  let seenPrompt = false;
  for (const input of inputs) if (input.canonical) {
    if (seenPrompt) { delete input.canonical; diagnostics.push("AMBIGUOUS_PROMPT:" + input.name); }
    seenPrompt = true;
  }
  const outputs = (Array.isArray(endpoint.returns) ? endpoint.returns : outputIds.map(() => ({}))).map((raw, i) => {
    const p = record(raw), c = components.find(c => c.id === outputIds[i]);
    const component = String(c?.type ?? p.component ?? "").toLowerCase();
    const outputSchema=resolveGradioSchema(sourceSchema(p, c ?? {}, "output"));
    const mime=outputSchema.contentMediaType ?? record(record(outputSchema.properties).mime_type).const;
    const schemaMedia=typeof mime==="string"&&/^(image|video|audio)\//.test(mime)?mime.split("/")[0]:undefined;
    return { component: ["image","gallery","video","audio"].includes(component)?component:schemaMedia??component, index: i };
  });
  const mediaOutputs = outputs.filter(o => ["image", "gallery", "video", "audio"].includes(o.component));
  const selected = mediaOutputs[0];
  if (!selected) diagnostics.push("OUTPUT_MEDIA_UNRESOLVED");
  if (mediaOutputs.length > 1) diagnostics.push("OUTPUT_SELECTION_REVIEW");
  if (!seenPrompt) diagnostics.push("PROMPT_BINDING_REVIEW");
  if (/train|profile|toggle|prepare|depthmap|scene[s]?$/.test(apiName)) diagnostics.push("ENDPOINT_PURPOSE_REVIEW");
  return {
    requiresSession: inputs.some(f=>f.component === "state"),
    version: 1, apiName, inputs,
    output: selected ? { media: selected.component === "gallery" ? "image" : selected.component as "image" | "audio" | "video", path: [selected.index], multiple: selected.component === "gallery" } : null,
    diagnostics: [...new Set(diagnostics)], reviewed: false,
  };
}
