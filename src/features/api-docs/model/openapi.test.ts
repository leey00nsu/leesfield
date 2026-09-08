import { describe, it, expect, vi } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import type { RequestBodyObject, SchemaObject } from "openapi3-ts/oas31";
import { getOpenApiDocument } from "./openapi";
import { externalGenerationRequestSchema } from "@/shared/api/external-contract";
const catalog = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("Public document accessed private catalog");
  }),
);
vi.mock("@/server/model-catalog/catalog-service", () => ({
  getModelCatalog: catalog,
}));
describe("public API protocol", () => {
  it("contains only the four generic authenticated operations", () => {
    const document = getOpenApiDocument();
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        "/api/external/generations",
        "/api/external/generations/{requestId}",
        "/api/external/models",
        "/api/external/models/{modelId}/schema",
      ]),
    );
    expect(document).not.toHaveProperty("x-model-inputs");
    expect(JSON.stringify(document)).not.toMatch(
      /ModelInput[0-9]|providerConfig|secret-space/,
    );
    expect(catalog).not.toHaveBeenCalled();
    for (const path of Object.values(document.paths))
      for (const operation of Object.values(path))
        expect(operation.security).toEqual([{ ApiKeyAuth: [] }]);
  });
  it("uses the same generic request definition as the route", () => {
    const request = getOpenApiDocument().paths["/api/external/generations"]!
      .post!.requestBody as RequestBodyObject;
    const schema = request.content["application/json"].schema as SchemaObject;
    expect(Object.keys(schema.properties!)).toEqual([
      "type",
      "model",
      "dynamicParams",
    ]);
    expect(schema.properties!.model).not.toHaveProperty("enum");
    const validate = new Ajv2020({ strict: false }).compile(schema);
    for (const body of [
      {
        type: "image",
        model: "selected-id",
        dynamicParams: { prompt: "sample", seed: 0 },
      },
      { type: "video", model: "selected-id", prompt: "wrong-place" },
      { type: "invalid", model: "selected-id" },
    ])
      expect(validate(body)).toBe(
        externalGenerationRequestSchema.safeParse(body).success,
      );
    const multipart=request.content["multipart/form-data"].schema as SchemaObject;
    const validateMultipart=new Ajv2020({strict:false,validateFormats:false}).compile(multipart);
    expect(validateMultipart({type:"image",model:"selected-id","file:frame":"binary-content"})).toBe(true);
    expect(validateMultipart({type:"image",model:"selected-id",seed:"42"})).toBe(false);
  });
});
it("keeps filesystem external routes covered by the generated document", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const { resolve, relative, sep } = await import("node:path");
  const root = resolve(process.cwd(), "src/app/api/external");
  const actual: string[] = [];
  async function visit(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name === "route.ts") {
        const code = await readFile(path, "utf8");
        const route =
          "/api/external/" +
          relative(root, dir)
            .split(sep)
            .join("/")
            .replace(/\[([^\]]+)\]/g, "{$1}");
        for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"])
          if (new RegExp("export async function " + method + "\\b").test(code))
            actual.push(method + " " + route);
      }
    }
  }
  await visit(root);
  const documented = Object.entries(getOpenApiDocument().paths).flatMap(
    ([path, item]) =>
      Object.keys(item)
        .filter((method) =>
          ["get", "post", "put", "patch", "delete"].includes(method),
        )
        .map((method) => method.toUpperCase() + " " + path),
  );
  expect(actual.sort()).toEqual(documented.sort());
});
