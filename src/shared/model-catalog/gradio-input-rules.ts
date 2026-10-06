import { gradioSchemaValidator, resolveGradioSchema } from "./gradio-json-schema";
import { gradioObjectAuthoringSchema } from "./gradio-object-schema";

/** Conditional rules describe the complete authoring object using provider names. */
export function assertGradioInputRules(schema: Record<string, unknown>, names: readonly string[], defaults: Record<string, unknown> = {}) {
  gradioSchemaValidator(schema);
  const known = new Set(names), seen = new Set<object>();
  function visit(node: unknown) {
    if (!node || typeof node !== "object" || Array.isArray(node) || seen.has(node)) return;
    seen.add(node);
    const s = resolveGradioSchema(node as Record<string, unknown>, schema);
    if (s !== node) visit(s);
    if (s.type !== undefined && s.type !== "object") throw new Error("HF_CONTRACT_RULES_OBJECT");
    const properties = s.properties && typeof s.properties === "object" ? Object.keys(s.properties) : [];
    const required = Array.isArray(s.required) ? s.required : [];
    const dependencies = ["dependentRequired", "dependentSchemas", "dependencies"].flatMap(key => s[key] && typeof s[key] === "object" ? Object.entries(s[key] as Record<string, unknown>).flatMap(([name, values]) => [name, ...(Array.isArray(values) ? values : [])]) : []);
    for (const name of [...properties, ...required, ...dependencies]) {
      if (typeof name !== "string" || !known.has(name)) throw new Error("HF_CONTRACT_RULES_UNKNOWN_PARAMETER:" + String(name));
    }
    for (const key of ["allOf", "anyOf", "oneOf"]) if (Array.isArray(s[key])) (s[key] as unknown[]).forEach(visit);
    for (const key of ["if", "then", "else", "not"]) visit(s[key]);
    for (const key of ["dependentSchemas", "dependencies"]) if (s[key] && typeof s[key] === "object") Object.values(s[key] as Record<string, unknown>).forEach(visit);
  }
  visit(schema);
  gradioSchemaValidator(gradioObjectAuthoringSchema(schema, defaults));
}
