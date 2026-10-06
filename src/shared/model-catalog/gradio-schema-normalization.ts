// Visit JSON Schema positions only. Values inside enum/const/default/examples
// are provider data and must retain their keys, including x-* annotations.
const schemaMaps = new Set(["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"]);
const schemaNodes = new Set(["additionalProperties", "additionalItems", "unevaluatedProperties", "unevaluatedItems", "propertyNames", "contains", "not", "if", "then", "else", "contentSchema"]);
const schemaArrays = new Set(["allOf", "anyOf", "oneOf", "prefixItems"]);

export function normalizeGradioSchema<T>(value: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const entries = Object.entries(value).flatMap(([key, child]) => {
    if (key === "additional_description" || key.startsWith("x-")) return [];
    let normalized = child;
    if (schemaMaps.has(key) && child && typeof child === "object" && !Array.isArray(child)) {
      normalized = Object.fromEntries(Object.entries(child).map(([name, schema]) => [name, normalizeGradioSchema(schema)]));
    } else if (schemaNodes.has(key)) {
      normalized = normalizeGradioSchema(child);
    } else if (key === "items" || schemaArrays.has(key)) {
      normalized = Array.isArray(child) ? child.map(normalizeGradioSchema) : normalizeGradioSchema(child);
    } else if (key === "dependencies" && child && typeof child === "object" && !Array.isArray(child)) {
      normalized = Object.fromEntries(Object.entries(child).map(([name, dependency]) => [name, Array.isArray(dependency) ? dependency : normalizeGradioSchema(dependency)]));
    }
    return [[key, normalized]];
  });
  return Object.fromEntries(entries) as T;
}
