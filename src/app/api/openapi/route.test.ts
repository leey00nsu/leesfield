import { describe, it, expect, vi } from "vitest";
const catalog = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("Private catalog read");
  }),
);
const locale = vi.hoisted(() => ({ value: "ko" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => locale }),
}));
vi.mock("@/server/model-catalog/catalog-service", () => ({
  getModelCatalog: catalog,
}));
import { GET } from "./route";
describe("public OpenAPI response", () => {
  it.each(["ko", "en"])("serves %s protocol without reading private catalog data", async (lang) => {
    locale.value = lang;
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.info.version).toBe("2.1.0");
    expect(body.components.securitySchemes.BearerAuth.scheme).toBe("bearer");
    expect(body.paths["/api/external/generations/{requestId}"].get["x-usage-notes"].join(" ")).toContain(lang === "ko" ? "같은 계정과 API 키" : "same account and API key");
    expect(body.paths["/api/external/models/{modelId}/schema"]).toBeDefined();
    expect(body.paths["/api/external/monitoring/overview"].get["x-conditional-permissions"]).toContainEqual({ field: "scope", condition: "all", permission: "monitoring:read-all" });
    expect(body.paths["/api/external/admin/models"].get["x-required-permissions"]).toEqual(["models:manage"]);
    expect(body.paths["/api/external/prompt-presets/{key}"].delete.requestBody.content["application/json"].schema.required).toContain("expectedRevision");
    expect(body.paths["/api/external/history"].get["x-resource-scope"]).toBe("owner");
    expect(body).not.toHaveProperty("x-model-inputs");
    expect(catalog).not.toHaveBeenCalled();
  });
});
