import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import { gradioObjectAuthoringSchema, gradioGroupAuthoringSchema } from "./gradio-object-schema";
import { assertGradioInputRules } from "./gradio-input-rules";

describe("default-aware public root conditions", () => {
  it("accounts for defaults constrained by additionalProperties in roots and conditions", () => {
    const schema = { type: "object", properties: { mode: { type: "string" } }, additionalProperties: { type: "number" } };
    const conditional = { type: "object", if: schema, then: { properties: { mode: { const: "accepted" } } }, else: { properties: { mode: { const: "repair" } } } };
    const ajv = new Ajv2020({ strict: false });
    for (const raw of [schema, conditional]) for (const defaults of [{ mode: "accepted", optional: "" }, { mode: "accepted", optional: 2 }]) {
      const source = ajv.compile(raw), projected = ajv.compile(gradioObjectAuthoringSchema(raw, defaults));
      for (const input of [{}, { optional: 3 }, { optional: "bad" }, { mode: "repair" }, { mode: "accepted", optional: 3 }]) {
        expect(projected(input), JSON.stringify({ raw, defaults, input })).toBe(source({ ...defaults, ...input }));
      }
    }
  });
  it("preserves additional property default checks in a namespaced Modal group", () => {
    const raw = { type: "object", properties: { mode: { type: "string" } }, additionalProperties: { type: "number" } };
    const defaults = { mode: "accepted", optional: "" };
    const ajv = new Ajv2020({ strict: false }), source = ajv.compile(raw);
    // The registry declares optional in the field schema; the group predicate
    // deliberately constrains it through additionalProperties instead.
    const group = { type: "object", properties: { mode: {}, optional: {} }, allOf: [raw] };
    const projected = ajv.compile(gradioGroupAuthoringSchema(group, defaults, "advanced__"));
    for (const input of [{}, { optional: 3 }, { optional: "bad" }]) {
      const publicInput = { prompt: "outside-group", ...Object.fromEntries(Object.entries(input).map(([key, value]) => ["advanced__" + key, value])) };
      expect(projected(publicInput)).toBe(source({ ...defaults, ...input }));
    }
  });
  it("matches independent source validation with defaults for local refs and dependency triggers", () => {
    const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object",
      $defs: { edit: { properties: { mode: { const: "edit" } }, required: ["mode"] } },
      if: { $ref: "#/$defs/edit" }, then: { properties: { text: { type: "string", minLength: 1 } }, required: ["text"] },
      dependentRequired: { enabled: ["token"] }, dependentSchemas: { enabled: { properties: { token: { const: "present" } }, required: ["token"] } } };
    const defaults = { mode: "plain", enabled: false };
    const ajv = new Ajv2020({ strict: false }), source = ajv.compile(schema);
    const publicSchema = ajv.compile(gradioObjectAuthoringSchema(schema, defaults));
    for (const input of [{}, { token: "present" }, { mode: "edit", token: "present" },
      { mode: "edit", text: "go", token: "present" }, { mode: "plain", token: "bad" }]) {
      expect(publicSchema(input), JSON.stringify(input)).toBe(source({ ...defaults, ...input }));
    }
  });
  it("preserves boolean property conditions and the schema dialect", () => {
    const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object",
      if: { properties: { mode: false }, required: ["mode"] }, then: false,
      properties: { tags: { type: "array", prefixItems: [{ const: 1 }], items: false } } };
    const defaults = { mode: "plain", tags: [1] };
    const ajv = new Ajv2020({ strict: false }), source = ajv.compile(schema);
    const projected = ajv.compile(gradioObjectAuthoringSchema(schema, defaults));
    for (const input of [{}, { mode: "plain" }, { tags: [2] }, { tags: [1, 2] }]) expect(projected(input)).toBe(source({ ...defaults, ...input }));
  });
  it("rejects undeclared dependency names and explicitly reports unmappable aggregate defaults", () => {
    for (const schema of [
      { type: "object", dependencies: { typo: ["mode"] } },
      { $schema: "https://json-schema.org/draft/2020-12/schema", dependentSchemas: { mode: { required: ["typo"] } } },
      { $schema: "https://json-schema.org/draft/2020-12/schema", dependentRequired: { mode: ["typo"] } },
    ]) expect(() => assertGradioInputRules(schema, ["mode"], { mode: "plain" })).toThrow("HF_CONTRACT_RULES_UNKNOWN_PARAMETER");
    expect(() => assertGradioInputRules({ type: "object", minProperties: 1 }, ["mode"], { mode: "plain" })).toThrow("HF_CONTRACT_RULES_MAPPING_LIMITED:minProperties");
  });
});
