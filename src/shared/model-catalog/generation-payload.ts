import { generationFields } from "@/shared/api/generation-input";
import { getGradioContract } from "./gradio-contract";
import { parameterKind, numericParameterValue } from "./parameter-contract";

type Model = { type: "image" | "video" | "audio"; providerConfig?: unknown; parameters?: unknown };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** One authoring -> request boundary for every media/provider. Explicit provider
 * inputs take precedence and remain strictly typed by their source schema. */
export function generationPayload(model: Model, payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const values = record(payload), parameters = record(model.parameters);
  const result = { ...values };
  if (values.dynamicParams !== undefined && (!values.dynamicParams || typeof values.dynamicParams !== "object" || Array.isArray(values.dynamicParams))) return result;
  const contract = getGradioContract(model);
  if (contract) {
    const dynamic = { ...record(values.dynamicParams) };
    const fileInputs = record(values.fileInputs);
    for (const [name, sources] of Object.entries(fileInputs)) {
      const field = contract.inputs.find(f=>f.name===name&&["file","files","gallery"].includes(f.kind));
      if (!field || !Array.isArray(sources)) { dynamic[name]=sources; continue; }
      dynamic[name] = field.kind==="file" && sources.length===1 ? sources[0] : sources;
    }
    for (const field of contract.inputs) {
      const key = Object.keys(parameters).find(key => record(record(parameters[key]).binding).parameterName === field.name) ?? field.name;
      // Older audio nodes persist UI binding keys inside dynamicParams.
      if (key !== field.name && Object.hasOwn(dynamic, key)) {
        if (!Object.hasOwn(dynamic, field.name)) dynamic[field.name] = field.kind === "number" ? numericParameterValue(dynamic[key]) : dynamic[key];
        delete dynamic[key];
      }
      if (field.canonical || Object.hasOwn(dynamic, field.name)) continue;
      const value = values[key];
      if (value !== undefined && (value !== "" || field.kind !== "number")) dynamic[field.name] = field.kind === "number" ? numericParameterValue(value) : value;
    }
    const references = Array.isArray(values.initImages) ? values.initImages : values.initImage ? [values.initImage] : [];
    const imageFields = contract.inputs.filter(field => ["file", "files", "gallery"].includes(field.kind) && field.media === "image");
    // Legacy generic references are only unambiguous for a single file field.
    const imageField = imageFields.length===1 ? imageFields[0] : undefined;
    if(references.length && imageFields.length>1) dynamic.__ambiguous_image_input=references;
    if (imageField && references.length && !Object.hasOwn(dynamic, imageField.name)) {
      dynamic[imageField.name] = imageField.kind === "file" && references.length === 1 ? references[0] : references;
    }
    const audioField = contract.inputs.find(field => field.kind === "file" && field.media === "audio");
    if (audioField && values.inputAudio && !Object.hasOwn(dynamic, audioField.name)) dynamic[audioField.name] = values.inputAudio;
    result.dynamicParams = dynamic;
    // Only the generic routing/media envelope and actual provider inputs survive.
    // Old nodes may still contain unrelated width/duration/steps placeholders.
    for (const key of Object.keys(result)) if (!["model", "prompt", "dynamicParams", "initImages", "initImage", "inputAudio"].includes(key)) delete result[key];
    return result;
  }
  // Request envelopes retain their stable public types; provider values above
  // retain the types required by the model's declared bindings.
  for (const [key, field] of Object.entries(generationFields[model.type])) {
    const value = result[key];
    if (field.wire === "string" && typeof value === "number" && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))
      && parameterKind(key, record(parameters[key])) === "number") result[key] = String(value);
  }
  return result;
}
