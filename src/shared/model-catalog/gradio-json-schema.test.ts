// @vitest-environment node
import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

async function freshValidator() {
  vi.resetModules();
  return (await import("./gradio-json-schema")).gradioSchemaValidator;
}

describe("Gradio compiled schema reuse", () => {
  it("reuses 140 distinct schemas across repeated three-media sweeps", async () => {
    const validator = await freshValidator();
    const compile = vi.spyOn(Ajv.prototype, "compile");
    const schemas = Array.from({ length: 140 }, (_, index) => ({ type: "string", enum: ["value-" + index] }));
    for (const schema of schemas) expect(validator(schema)(schema.enum[0])).toBe(true);
    compile.mockClear();
    for (let pass = 0; pass < 6; pass++) for (const schema of schemas) {
      expect(validator(structuredClone(schema))(schema.enum[0])).toBe(true);
      expect(validator(schema)("invalid")).toBe(false);
    }
    expect(compile).not.toHaveBeenCalled();
  });

  it("evicts cold entries while retaining recently used validators", async () => {
    const validator = await freshValidator();
    const schemas = Array.from({ length: 512 }, (_, index) => ({ const: index }));
    const first = validator(schemas[0]), second = validator(schemas[1]);
    for (const schema of schemas.slice(2)) validator(schema);
    expect(validator({ const: 0 })).toBe(first);
    validator({ const: 512 });
    expect(validator(schemas[0])).toBe(first);
    expect(validator(schemas[1])).not.toBe(second);
    expect(first(0)).toBe(true);
    expect(first(1)).toBe(false);
  });

  it("bounds serialized key retention even below the entry limit", async () => {
    const validator = await freshValidator();
    const schema = (index: number) => ({ const: index, description: "x".repeat(90_000) });
    const first = validator(schema(0));
    for (let index = 1; index < 100; index++) validator(schema(index));
    expect(validator(schema(0))).not.toBe(first);
  });

  it("detects mutation and preserves independent draft7/2020 validation", async () => {
    const validator = await freshValidator();
    const schema = { type: "number", minimum: 1 };
    const original = validator(schema);
    schema.minimum = 3;
    const changed = validator(schema);
    expect(original(2)).toBe(true);
    expect(changed(2)).toBe(false);
    const tuple = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "array", prefixItems: [{ const: 1 }], items: false };
    const source = new Ajv2020({ strict: false }).compile(tuple);
    for (const input of [[], [1], [2], [1, 2], null]) expect(validator(tuple)(input)).toBe(source(input));
  });

  it("rejects oversized, async and remote schemas and retries failed compilation", async () => {
    const validator = await freshValidator();
    expect(() => validator({ description: "x".repeat(100_000) })).toThrow("SCHEMA_SIZE_LIMIT");
    expect(() => validator({ $async: true, type: "string" })).toThrow("ASYNC_SCHEMA");
    const compile = vi.spyOn(Ajv.prototype, "compile");
    for (let attempt = 0; attempt < 2; attempt++) expect(() => validator({ $ref: "https://unresolved.invalid/schema" })).toThrow();
    expect(compile).toHaveBeenCalledTimes(2);
    expect(validator({ type: "integer" })(1)).toBe(true);
    expect(validator({ type: "integer" })("1")).toBe(false);
  });
});
