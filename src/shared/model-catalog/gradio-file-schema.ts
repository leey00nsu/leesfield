import type { GradioField } from "./gradio-contract";
import { gradioSchemaValidator, resolveGradioSchema } from "./gradio-json-schema";
import { normalizeGradioSchema } from "./gradio-schema-normalization";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Project supported Gradio file envelopes to URL authoring values. The SDK
 * constructs uploaded FileData later; URL strings are not wire FileData objects.
 */
export function gradioFileAuthoringSchema(field: GradioField): Record<string, unknown> {
  if (!["file", "files", "gallery"].includes(field.kind)) return field.schema;
  if (!Object.keys(field.schema).length) return field.kind === "file" ? { type: "string" } : { type: "array", items: { type: "string" } };
  gradioSchemaValidator(field.schema); // Unsupported validation and refs still fail.
  function project(raw: Record<string, unknown>, depth: number): Record<string, unknown> {
    if (depth > 12) throw new Error("FILE_SCHEMA_DEPTH_LIMIT");
    const source = resolveGradioSchema(raw, field.schema);
    if (source.$ref) throw new Error("FILE_SCHEMA_UNRESOLVED");
    // Comfy Volume filenames are a wire contract. The executor validates the
    // allocated filenames against the source after upload, before submission.
    if (source.format === "comfy-input-name") return { type: source.type ?? "string" };
    const props = record(source.properties);
    const envelope = "image" in props || "video" in props;
    if (source.title === "FileData" || source.title === "ImageData" || (source.type === "object" && "path" in props)) {
      const standard = new Set(["type", "title", "description", "properties", "required", "default", "examples", "$defs", "definitions"]);
      if (Object.keys(normalizeGradioSchema(source)).some(key => !standard.has(key))) throw new Error("FILE_SCHEMA_CONSTRAINT_UNSUPPORTED");
      if (Array.isArray(source.required) && source.required.some(name => !["path", "meta"].includes(String(name)))) throw new Error("FILE_SCHEMA_CONSTRAINT_UNSUPPORTED");
      // Upload paths are allocated by the SDK. Do not erase path-specific constraints.
      if (Object.keys(record(props.path)).some(key => !["type", "title", "description", "default", "anyOf", "additional_description"].includes(key) && !key.startsWith("x-"))) throw new Error("FILE_SCHEMA_CONSTRAINT_UNSUPPORTED");
      return { type: "string" };
    }
    if (envelope && field.kind === "gallery") {
      if (field.media === "image" && !("image" in props) || field.media === "video" && !("video" in props)) return { not: {} };
      const nested = project(record(props[field.media === "video" ? "video" : "image"] ?? props.video), depth + 1);
      if (nested.type !== "string") throw new Error("FILE_GALLERY_ENVELOPE");
      return { type: "string" };
    }
    const result = { ...source };
    for (const key of ["anyOf", "oneOf", "allOf"]) {
      if (Array.isArray(source[key])) result[key] = (source[key] as unknown[]).map(child => project(record(child), depth + 1));
    }
    if (source.type === "array") {
      if (source.items === false || Array.isArray(source.items) || source.prefixItems) throw new Error("FILE_SCHEMA_TUPLE_UNSUPPORTED");
      result.items = project(record(source.items), depth + 1);
    }
    if (source.type === "object") throw new Error("FILE_SCHEMA_UNSUPPORTED");
    return result;
  }
  return project(field.schema, 0);
}
