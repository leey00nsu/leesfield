import { describe, it, expect, vi } from "vitest";
const catalog = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("Private catalog read");
  }),
);
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "ko" }) }),
}));
vi.mock("@/server/model-catalog/catalog-service", () => ({
  getModelCatalog: catalog,
}));
import { GET } from "./route";
describe("public OpenAPI response", () => {
  it("serves the common protocol without reading private catalog data", async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.paths["/api/external/models/{modelId}/schema"]).toBeDefined();
    expect(body).not.toHaveProperty("x-model-inputs");
    expect(catalog).not.toHaveBeenCalled();
  });
});
