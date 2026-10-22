import { describe, it, expect, vi } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import type { RequestBodyObject, SchemaObject } from "openapi3-ts/oas31";
import { getOpenApiDocument } from "./openapi";
import { externalGenerationRequestSchema, externalApiVersion } from "@/shared/api/external-contract";
import { buildApiSections, buildExampleFromSchema } from "./openapi-helpers";
import { getOpenApiTranslations } from "./openapi-translations";
import koMessages from "@/shared/i18n/messages/ko.json";
import enMessages from "@/shared/i18n/messages/en.json";
import { createPromptPresetSchema } from "@/shared/prompt-presets/prompt-preset-contract";
import { modelCatalogInputSchema } from "@/server/model-catalog/catalog-schema";
import { buildQueueFullResponse } from "@/server/http/response";
import { nodeExecutionErrorResponse } from "@/server/node-executions/node-execution-http";
import { NodeExecutionQueueFullError } from "@/server/node-executions/node-execution-errors";
import { externalSpaceUpdateSchema } from "@/shared/api/spaces-contract";
import { validateCanonicalGraph } from "@/shared/generation-graph/canonical-graph";
import { isUnavailableEditNodeKind } from "@/shared/generation-graph/node-availability";
const catalog = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("Public document accessed private catalog");
  }),
);
vi.mock("@/server/model-catalog/catalog-service", () => ({
  getModelCatalog: catalog,
}));
describe("public API protocol", () => {
  it("documents a valid timestamp Frames graph with its single frame output and no unavailable edits", () => {
    const document = getOpenApiDocument();
    const operation = buildApiSections(document).flatMap(section => section.operations)
      .find(operation => operation.method === "PUT" && operation.path === "/api/external/spaces/{spaceId}")!;
    const example = externalSpaceUpdateSchema.parse(buildExampleFromSchema(operation.request!.schema, document));
    expect(validateCanonicalGraph(example)).toEqual([]);
    expect(example.nodes.find(node => node.kind === "edit.video.extractFrames")?.config).toEqual({ parameters: { timestampMs: 1500 } });
    expect(example.edges.find(edge => edge.sourceNodeId === "frames")).toMatchObject({ sourcePortId: "frame", targetPortId: "image" });
    expect(example.nodes.some(node => isUnavailableEditNodeKind(node.kind))).toBe(false);
  });

  it("only declares errors applicable to each operation", () => {
    const paths = getOpenApiDocument().paths;
    for (const [path, item] of Object.entries(paths)) {
      for (const method of ["get", "post", "put", "patch", "delete"] as const) {
        const operation = item[method];
        if (!operation) continue;
        if (!operation.requestBody) {
          for (const code of ["408", "413", "415", "499"])
            expect(operation.responses, method + " " + path).not.toHaveProperty(code);
        }
      }
    }
    expect(paths["/api/external/spaces/capabilities"]!.get!.responses).not.toHaveProperty("404");
    expect(paths["/api/external/spaces/capabilities"]!.get!.responses).not.toHaveProperty("409");
    for (const code of ["409", "410", "422"]) expect(paths["/api/external/assets/{assetId}"]!.get!.responses).not.toHaveProperty(code);
    expect(paths["/api/external/assets/uploads/{uploadId}/confirm"]!.post!.responses).toHaveProperty("410");
    expect(paths["/api/external/assets/uploads/{uploadId}/confirm"]!.post!.responses).toHaveProperty("422");
    expect(paths["/api/external/spaces/{spaceId}"]!.put!.responses).toHaveProperty("409");
    expect(paths["/api/external/spaces/{spaceId}/copy"]!.post!.responses).toHaveProperty("400");
    const status = paths["/api/external/history/status"]!.get!;
    expect(status.parameters!.flatMap((p) => "$ref" in p ? [] : [p.name]).sort()).toEqual(["hidden", "model", "prompt", "query", "type"]);
    expect(status.responses).not.toHaveProperty("400");
    const detailType = paths["/api/external/history/{historyId}"]!.get!.parameters!.find((p) => !("$ref" in p) && p.name === "type")!;
    expect(detailType).not.toHaveProperty("schema.x-invalid-behavior");
    expect(detailType).not.toHaveProperty("schema.x-normalization");
    expect(detailType).not.toHaveProperty("description", expect.stringContaining("unrecognized"));
    for (const messages of [koMessages, enMessages]) {
      const localized = getOpenApiDocument(getOpenApiTranslations(messages)).paths["/api/external/history"]!.get!;
      for (const name of ["type", "sort", "limit", "offset", "query", "hidden", "includeTotal"]) {
        const parameter = localized.parameters!.find((p) => !("$ref" in p) && p.name === name)!;
        expect(parameter).toHaveProperty("description", messages.apiDocs.openapi.operationParameters["GET /api/external/history"][name as keyof typeof messages.apiDocs.openapi.operationParameters["GET /api/external/history"]]);
      }
    }
  });
  it.each([koMessages, enMessages])("generates usable requests and schema-valid response examples", (messages) => {
    const document = getOpenApiDocument(getOpenApiTranslations(messages));
    const examples = messages.apiDocs.examples;
    const operations = buildApiSections(document).flatMap((section) => section.operations);
    const createPreset = operations.find((op) => op.path === "/api/external/prompt-presets" && op.method === "POST")!;
    expect(createPromptPresetSchema.safeParse(buildExampleFromSchema(createPreset.request!.schema, document, undefined, examples)).success).toBe(true);
    const registration = operations.find((op) => op.path === "/api/external/admin/models" && op.method === "POST")!;
    const input = buildExampleFromSchema(registration.request!.schema, document, undefined, examples);
    expect(modelCatalogInputSchema.safeParse(input).success).toBe(true);
    const ajv = new Ajv2020({ strict: false, validateFormats: false });
    for (const operation of operations) {
      if (operation.request?.schema && operation.request.contentType === "application/json") {
        const validate = ajv.compile({ ...operation.request.schema, components: document.components });
        expect(validate(buildExampleFromSchema(operation.request.schema, document, undefined, examples)),
          operation.method + " " + operation.path + ": " + JSON.stringify(validate.errors)).toBe(true);
      }
      for (const response of operation.responses.filter((r) => r.schema)) {
        const validate = ajv.compile({ ...response.schema!, components: document.components });
        const payloads = response.examples?.length ? response.examples.map((example) => example.value)
          : [response.example ?? buildExampleFromSchema(response.schema, document, undefined, examples)];
        for (const payload of payloads) {
          expect(validate(payload),
            operation.method + " " + operation.path + " " + response.status + ": " + JSON.stringify(validate.errors)).toBe(true);
          if (Number(response.status) < 400) continue;
          expect(response.examples?.length).toBeGreaterThan(0);
          const error = payload as { message: string; reason?: string };
          expect(error.message).not.toBe("OK");
          if (!error.reason) continue;
          expect(operation.method).toBe("POST");
          expect(operation.path === "/api/external/generations" || operation.path.endsWith("/nodes/{nodeId}/executions")).toBe(true);
          expect(error.message).toBe("GENERATION_QUEUE_FULL");
          expect(response.status).toBe(error.reason === "GLOBAL_LIMIT" ? "503" : "429");
        }
      }
    }
    const validateRegistration = ajv.compile({ ...registration.request!.schema!, components: document.components });
    const invalid = { ...(input as Record<string, unknown>), providerConfig: {} };
    expect(validateRegistration(invalid)).toBe(false);
    expect(validateRegistration({ ...(input as Record<string, unknown>), apiKey: "wrong-media-credential" })).toBe(false);
    expect(validateRegistration({ ...(input as Record<string, unknown>), provider: "codex_cli" })).toBe(false);
    const llm = { type: "llm", key: "example-llm", label: "Example", vendor: "Example",
      provider: "openai_compatible", providerConfig: { base_url: "https://api.example.com/v1", model_id: "example", supports_images: true },
      parameters: {}, meta: {} };
    expect(validateRegistration(llm)).toBe(false);
    expect(validateRegistration({ ...llm, apiKey: "example-credential" })).toBe(true);
    expect(validateRegistration({ ...llm, isActive: false })).toBe(true);
    expect(modelCatalogInputSchema.safeParse(llm).success).toBe(true);
  });
  it("matches admission examples to real classic and Spaces error responses", async () => {
    const operations = buildApiSections(getOpenApiDocument()).flatMap((section) => section.operations);
    for (const path of ["/api/external/generations", "/api/external/spaces/{spaceId}/nodes/{nodeId}/executions"]) {
      const operation = operations.find((operation) => operation.method === "POST" && operation.path === path)!;
      for (const reason of ["OWNER_LIMIT", "PROVIDER_LIMIT", "GLOBAL_LIMIT"] as const) {
        const actual = path === "/api/external/generations" ? buildQueueFullResponse(reason)
          : nodeExecutionErrorResponse(new NodeExecutionQueueFullError(reason))!;
        const example = operation.responses.find((response) => response.status === String(actual.status))!.examples!.find((example) => example.name === reason)!;
        expect(example.value).toEqual(await actual.json());
      }
    }
    const graph = operations.find((operation) => operation.method === "PUT" && operation.path === "/api/external/spaces/{spaceId}")!;
    expect(graph.responses.find((response) => response.status === "409")!.example).toEqual({ message: "GRAPH_VERSION_CONFLICT" });
    expect(graph.responses.find((response) => response.status === "401")!.example).toEqual({ message: "API_KEY_REQUIRED" });
    expect(graph.responses.find((response) => response.status === "429")!.examples).toEqual([{ name: "RATE_LIMITED", value: { message: "RATE_LIMITED" } }]);
  });
  it("only documents query filters used by each monitoring operation", () => {
    const paths = getOpenApiDocument().paths;
    const names = (suffix: string) => paths["/api/external/monitoring/" + suffix]!.get!.parameters!
      .flatMap((p) => "$ref" in p ? [] : [p.name]).sort();
    expect(names("requests/detail")).toEqual(["requestId", "scope", "type"]);
    expect(names("api-keys")).toEqual(["limit", "offset", "scope"]);
    expect(names("overview")).not.toEqual(expect.arrayContaining(["query"]));
    expect(names("stats")).not.toEqual(expect.arrayContaining(["includeTotal"]));
    expect(names("top")).toContain("metric");
    expect(names("top")).not.toContain("offset");
    expect(names("requests")).toEqual(expect.arrayContaining(["query", "limit", "offset", "includeTotal"]));
    expect(paths["/api/external/monitoring/requests/detail"]!.get!).not.toHaveProperty("x-query-limits");
  });
  it("contains generic authenticated operations without instance catalog data", () => {
    const document = getOpenApiDocument();
    expect(document.info.version).toBe(externalApiVersion);
    expect(document.info.version).toBe("2.2.0");
    expect(document.openapi).toBe("3.1.0");
    // The same document crosses the React server/client boundary in the docs UI.
    const assertPlainJson = (value: unknown, path = "$doc") => {
      if (value === null || typeof value !== "object") {
        expect(typeof value, path).not.toBe("function");
        return;
      }
      expect(Object.getPrototypeOf(value), path).toBe(Array.isArray(value) ? Array.prototype : Object.prototype);
      if (!Array.isArray(value)) {
        expect(Object.getOwnPropertyNames(value), path).toEqual(Object.keys(value));
        expect(Object.getOwnPropertySymbols(value), path).toHaveLength(0);
      }
      for (const [name, child] of Object.entries(value)) assertPlainJson(child, path + "." + name);
    };
    assertPlainJson(document);
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
      /ModelInput[0-9]|secret-space/,
    );
    expect(catalog).not.toHaveBeenCalled();
    expect(Object.values(document.paths).flatMap((path) => Object.keys(path))).toHaveLength(47);
    for (const path of Object.values(document.paths))
      for (const operation of Object.values(path))
        expect(operation.security).toEqual([{ ApiKeyAuth: [] }, { BearerAuth: [] }]);
  });
  it("documents actual idempotency, limits and response headers", () => {
    const document = getOpenApiDocument();
    const post = document.paths["/api/external/generations"]!.post!;
    expect(post.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ in: "header", name: "Idempotency-Key", required: false }),
      expect.objectContaining({ in: "header", name: "X-Idempotency-Key", required: false }),
    ]));
    expect((post.requestBody as RequestBodyObject).description).toMatch(/67108864.*30000.*64.*52428800/);
    expect(Object.keys(post.responses!)).toEqual(expect.arrayContaining(["408", "409", "413", "415", "429", "499", "503"]));
    for (const status of ["429", "503"]) {
      expect(post.responses![status]).toHaveProperty("headers.Retry-After");
    }
    for (const path of Object.values(document.paths))
      for (const operation of Object.values(path)) {
        expect(operation.responses).toHaveProperty("500");
        expect(Object.entries(operation.responses).find(([status]) => status.startsWith("2"))?.[1]).toHaveProperty("headers.X-Request-ID");
      }
    expect(document.components!.securitySchemes!.BearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
    expect(document.paths["/api/external/generations/{requestId}"]!.get!["x-resource-scope"]).toBe("account-and-api-key");
    expect(post.responses!["403"]).toHaveProperty("description", expect.stringContaining("promptPreset"));
    expect(post.responses!["409"]).toHaveProperty("description", expect.stringContaining("PRESET_CONFLICT"));
    const presetDelete = document.paths["/api/external/prompt-presets/{key}"]!.delete!;
    expect((presetDelete.requestBody as RequestBodyObject).content["application/json"].schema).toHaveProperty("required", ["expectedRevision"]);
    expect(document.paths["/api/external/history/{historyId}"]!.delete!.responses!["204"]).not.toHaveProperty("content");
    const adminCreate = document.paths["/api/external/admin/models"]!.post!;
    expect((adminCreate.requestBody as RequestBodyObject).description).toContain("1048576");
    expect(adminCreate.responses!["201"]).toBeDefined();
    expect(document.paths["/api/external/models"]!.get!.responses!["200"]).not.toHaveProperty("content.application/json.schema.properties.providerConfig");
  });
  it("uses the same generic request definition as the route", () => {
    const request = getOpenApiDocument().paths["/api/external/generations"]!
      .post!.requestBody as RequestBodyObject;
    const schema = request.content["application/json"].schema as SchemaObject;
    expect(Object.keys(schema.properties!)).toEqual([
      "type",
      "model",
      "dynamicParams",
      "promptPreset",
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
  it("exposes action permissions and actual query normalization as structured metadata", async () => {
    const { getExternalOperationPermission, externalOperationAdditionalPermissions } = await import("@/shared/api/platform-permissions");
    const { parseHistoryQuery } = await import("@/server/history/lib/history-query");
    const document = getOpenApiDocument();
    for (const [path, item] of Object.entries(document.paths))
      for (const [method, operation] of Object.entries(item)) {
        expect(operation["x-required-permissions"]).toEqual([getExternalOperationPermission(method, path.replace(/\{[^}]+\}/g, "example")), ...(externalOperationAdditionalPermissions[method.toUpperCase() + " " + path] ?? [])]);
        expect(operation.description).not.toMatch(/platform:|limit.*100|offset.*1000/);
      }
    const history = document.paths["/api/external/history"]!.get!;
    const limit = history.parameters!.find((p) => !("$ref" in p) && p.name === "limit")!;
    expect(limit).toHaveProperty("schema", { type: "integer", minimum: 1, maximum: 100, default: 24, "x-normalization": "parse-integer-clamp" });
    expect(parseHistoryQuery(new URLSearchParams()).limit).toBe(24);
    expect(history.parameters!.find((p) => !("$ref" in p) && p.name === "hidden")).toHaveProperty("schema", { type: "boolean", default: false, "x-normalization": "boolean-aliases" });
    expect(parseHistoryQuery(new URLSearchParams({ hidden: "true" })).hidden).toBe(true);
    expect(parseHistoryQuery(new URLSearchParams({ limit: "500" })).limit).toBe(100);
    expect(document.paths["/api/external/generations"]!.post!["x-request-limits"]).toMatchObject({ bodyBytes: 67108864, files: 64, fileBytes: 52428800 });
    expect(document.paths["/api/external/monitoring/stats"]!.get!["x-query-limits"]).toMatchObject({ defaultDays: 30, rangeDays: 31 });
    expect(document.paths["/api/external/monitoring/stats"]!.get!["x-conditional-permissions"]).toEqual([
      { field: "scope", permission: "monitoring:read-all", condition: "all" },
    ]);
    expect(document.paths["/api/external/generations"]!.post!["x-conditional-permissions"]).toEqual([
      { field: "promptPreset", permission: "presets:read", condition: "present" },
    ]);
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
          if (new RegExp("export (?:async function |const )" + method + "\\b").test(code))
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
