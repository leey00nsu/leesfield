import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ catalog: vi.fn(), auth: vi.fn() }));
vi.mock("@/server/model-catalog/catalog-service", () => ({
  getModelCatalog: mocks.catalog,
}));
vi.mock("@/server/auth/api-key-guard", () => ({ requireApiKey: mocks.auth }));
import { GET } from "./route";
import { GET as getSchema } from "./[modelId]/schema/route";
import { mappedModel } from "@/server/external-api/test-fixtures";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ownerEmail: "owner", apiKeyId: "key" });
  mocks.catalog.mockResolvedValue([
    mappedModel(),
    mappedModel("video"),
    { ...mappedModel("audio"), isActive: false },
  ]);
});
describe("private model discovery", () => {
  it("returns only active matching summaries, without provider or operational configuration", async () => {
    const response = await GET(
      new Request("http://localhost/api/external/models?type=image"),
    );
    expect(await response.json()).toEqual({
      items: [
        { id: "image-private-id", label: "Private image", type: "image" },
      ],
    });
    expect(
      (
        await GET(
          new Request("http://localhost/api/external/models?type=invalid"),
        )
      ).status,
    ).toBe(400);
  });
  it("returns input JSON Schema without internal provider metadata", async () => {
    const response = await getSchema(new Request("http://localhost"), {
      params: Promise.resolve({ modelId: "image-private-id" }),
    });
    const body = await response.json();
    expect(body.model).toEqual({
      id: "image-private-id",
      label: "Private image",
      type: "image",
    });
    expect(body.inputSchema.required).toEqual(["text"]);
    expect(body.files[0]).toMatchObject({ multipartField: "file:frame" });
    expect(JSON.stringify(body)).not.toMatch(
      /secret-space|private_internal|do-not-expose|providerConfig/,
    );
  });
  it.each(["missing", "audio-private-id"])(
    "returns 404 for missing or inactive schema %s",
    async (modelId) => {
      expect(
        (
          await getSchema(new Request("http://localhost"), {
            params: Promise.resolve({ modelId }),
          })
        ).status,
      ).toBe(404);
    },
  );
  it.each([401, 403])("auth %s prevents any catalog read", async (status) => {
    mocks.auth.mockResolvedValue(new Response(null, { status }));
    expect(
      (await GET(new Request("http://localhost/api/external/models"))).status,
    ).toBe(status);
    expect(
      (
        await getSchema(new Request("http://localhost"), {
          params: Promise.resolve({ modelId: "x" }),
        })
      ).status,
    ).toBe(status);
    expect(mocks.catalog).not.toHaveBeenCalled();
  });
});
