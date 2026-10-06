import { gradioSchemaValidator, resolveGradioSchema } from "./gradio-json-schema";
import { normalizeGradioSchema } from "./gradio-schema-normalization";

type Schema = Record<string, unknown>;
const record = (value: unknown): Schema => value && typeof value === "object" && !Array.isArray(value) ? value as Schema : {};

/** Project root conditions onto caller inputs, accounting for defaults that the
 * parser fills before validation. Property schemas still describe actual values.
 */
export function gradioObjectAuthoringSchema(schema: Schema, defaults: Schema): Schema {
  const root = normalizeGradioSchema(schema);
  function project(value: unknown, refs = new Set<string>()): unknown {
    if (typeof value === "boolean") return value;
    const node = record(value), result = { ...node };
    const extra: unknown[] = [];
    if (typeof node.$ref === "string") {
      if (refs.has(node.$ref)) throw new Error("HF_CONTRACT_RULES_MAPPING_LIMITED:recursive-root");
      const resolved = resolveGradioSchema({ $ref: node.$ref }, root);
      if (resolved.$ref === node.$ref) throw new Error("HF_CONTRACT_RULES_MAPPING_LIMITED:root-ref");
      extra.push(project(resolved, new Set([...refs, node.$ref])));
      delete result.$ref;
    }
    // Aggregate object constraints cannot be weakened when defaults insert keys.
    // Keep the configuration review explicit instead of publishing a false schema.
    if (Object.keys(defaults).length) for (const key of ["minProperties", "maxProperties", "const", "enum", "patternProperties", "propertyNames", "unevaluatedProperties"]) {
      if (node[key] !== undefined) throw new Error("HF_CONTRACT_RULES_MAPPING_LIMITED:" + key);
    }
    const required = new Set(Array.isArray(node.required) ? node.required as string[] : []);
    for (const name of required) if (Object.hasOwn(defaults, name)) required.delete(name);
    for (const [name, defaultValue] of Object.entries(defaults)) {
      const properties = record(node.properties);
      const property = Object.hasOwn(properties, name) ? properties[name] : node.additionalProperties;
      if (property === undefined || property === true) continue;
      const context = { ...(root.$schema ? { $schema: root.$schema } : {}), ...(root.$defs ? { $defs: root.$defs } : {}), ...(root.definitions ? { definitions: root.definitions } : {}) };
      const validate = gradioSchemaValidator({ ...context, type: "object", properties: { ...record(root.properties), [name]: property }, required: [name] });
      if (!validate({ [name]: defaultValue })) required.add(name);
    }
    if (node.additionalProperties === false && Object.keys(defaults).some(name => !Object.hasOwn(record(node.properties), name))) extra.push(false);
    if (node.required !== undefined || required.size) result.required = [...required];
    for (const key of ["allOf", "anyOf", "oneOf"]) if (Array.isArray(node[key])) result[key] = (node[key] as unknown[]).map(child => project(child, refs));
    for (const key of ["if", "then", "else", "not"]) if (node[key] !== undefined) result[key] = project(node[key], refs);
    for (const key of ["dependentRequired", "dependentSchemas", "dependencies"]) {
      const dependencies: Schema = {};
      for (const [name, dependency] of Object.entries(record(node[key]))) {
        const rule = Array.isArray(dependency) ? project({ required: dependency }, refs) : project(dependency, refs);
        if (Object.hasOwn(defaults, name)) extra.push(rule);
        else if (Array.isArray(dependency)) dependencies[name] = record(rule).required;
        else dependencies[name] = rule;
      }
      if (node[key] !== undefined) result[key] = dependencies;
    }
    if (extra.length) result.allOf = [...(Array.isArray(result.allOf) ? result.allOf : []), ...extra];
    return result;
  }
  return project(root) as Schema;
}

/** Groups validate only their own names at runtime. The outer public schema
 * rejects undeclared inputs; group predicates must allow the other group keys.
 */
export function gradioGroupAuthoringSchema(schema: Schema, defaults: Schema, prefix: string): Schema {
  const names = Object.keys(record(schema.properties));
  function namespace(value: unknown): unknown {
    if (typeof value === "boolean") return value;
    const node = record(value), result = { ...node };
    delete result.additionalProperties;
    if (node.properties) result.properties = Object.fromEntries(Object.entries(record(node.properties)).map(([name, property]) => [prefix + name, property]));
    if (Array.isArray(node.required)) result.required = node.required.map(name => prefix + name);
    for (const key of ["allOf", "anyOf", "oneOf"]) if (Array.isArray(node[key])) result[key] = (node[key] as unknown[]).map(namespace);
    for (const key of ["if", "then", "else", "not"]) if (node[key] !== undefined) result[key] = namespace(node[key]);
    for (const key of ["dependentRequired", "dependentSchemas", "dependencies"]) if (node[key]) result[key] = Object.fromEntries(Object.entries(record(node[key])).map(([name, dependency]) => [prefix + name, Array.isArray(dependency) ? dependency.map(name => prefix + name) : namespace(dependency)]));
    const otherNames = names.filter(name => !Object.hasOwn(record(node.properties), name));
    if (node.additionalProperties === false && otherNames.length) {
      result.allOf = [...(Array.isArray(result.allOf) ? result.allOf : []), { not: { anyOf: otherNames.map(name => ({ required: [prefix + name] })) } }];
    } else if (node.additionalProperties && typeof node.additionalProperties === "object") {
      result.properties = { ...record(result.properties), ...Object.fromEntries(otherNames.map(name => [prefix + name, node.additionalProperties])) };
    }
    return result;
  }
  return namespace(gradioObjectAuthoringSchema(schema, defaults)) as Schema;
}
