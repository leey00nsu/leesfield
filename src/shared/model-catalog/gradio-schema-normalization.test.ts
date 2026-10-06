// @vitest-environment node
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import { normalizeGradioSchema } from "./gradio-schema-normalization";
import { gradioSchemaValidator } from "./gradio-json-schema";
import sources from "@/server/hf-space/fixtures/provider-schema-sources.json";

describe("provider schema normalization", () => {
  it("compiles the captured Krea Dataframe without changing source or constraints", () => {
    const field = sources[1].parameters[0];
    const source = JSON.stringify(field);
    const validate = gradioSchemaValidator(field.type);
    expect(validate(field.parameter_default)).toBe(true);
    expect(validate({ headers: [] })).toBe(false);
    expect(validate({ headers: [], data: "wrong" })).toBe(false);
    expect(JSON.stringify(field)).toBe(source);
  });

  it("preserves actual data and property names using an independent raw Ajv oracle", () => {
    const data = { "x-mode": "original", additional_description: "user data" };
    const source = {
      type: "object", "x-role": "annotation", additional_description: null,
      properties: {
        "x-mode": { type: "string", additional_description: "annotation" },
        additional_description: { type: "string", "x-ui": true },
      }, required: ["x-mode", "additional_description"], additionalProperties: false,
      enum: [data], const: data, default: data, examples: [data],
    };
    const plain = { ...source, properties: { "x-mode": { type: "string" }, additional_description: { type: "string" } } };
    delete (plain as Partial<typeof source>)["x-role"];
    delete (plain as Partial<typeof source>).additional_description;
    const oracle = new Ajv().compile(plain);
    const effective = normalizeGradioSchema(source);
    expect(effective).toEqual(plain);
    expect(effective.const).toBe(data);
    const validate = gradioSchemaValidator(source);
    for (const candidate of [data, {}, { "x-mode": "changed", additional_description: "user data" }]) {
      expect(validate(candidate)).toBe(oracle(candidate));
    }
    expect(source.properties["x-mode"].additional_description).toBe("annotation");
  });

  it("visits schema maps, tuple items, conditionals and legacy dependencies", () => {
    const child = { type: "string", additional_description: null };
    const plain = { type: "string" };
    const source = {
      $defs: { "x-name": child }, definitions: { a: child },
      patternProperties: { "^x-": child }, dependentSchemas: { a: child },
      dependencies: { a: child, b: ["x-name"] },
      items: [child], prefixItems: [child], allOf: [child], anyOf: [child], oneOf: [child],
      additionalProperties: child, additionalItems: child, unevaluatedProperties: child,
      unevaluatedItems: child, propertyNames: child, contains: child, not: child,
      if: child, then: child, else: child, contentSchema: child,
    };
    const effective = normalizeGradioSchema(source);
    expect(effective.$defs["x-name"]).toEqual(plain);
    expect(effective.dependencies).toEqual({ a: plain, b: ["x-name"] });
    for (const key of ["items", "prefixItems", "allOf", "anyOf", "oneOf"] as const) expect(effective[key]).toEqual([plain]);
    for (const key of ["if", "then", "else", "contains", "not", "additionalProperties"] as const) expect(effective[key]).toEqual(plain);
  });

  it("keeps local refs and constraints while rejecting unsupported keywords, remote refs and async", () => {
    const source = { $defs: { a: { type: "integer", minimum: 2, additional_description: null } }, $ref: "#/$defs/a" };
    expect(gradioSchemaValidator(source)(2)).toBe(true);
    expect(gradioSchemaValidator(source)(1)).toBe(false);
    expect(() => gradioSchemaValidator({ type: "string", madeUpValidation: true })).toThrow();
    expect(() => gradioSchemaValidator({ $ref: "https://example.com/remote-schema" })).toThrow();
    expect(() => gradioSchemaValidator({ $async: true, type: "string" })).toThrow("ASYNC_SCHEMA");
  });
});
