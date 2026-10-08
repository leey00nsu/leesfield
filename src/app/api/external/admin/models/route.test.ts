// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), catalog: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), hf: vi.fn(), modal: vi.fn() }));
vi.mock("@/server/auth/api-key-guard", () => ({ requireApiKey: mocks.auth }));
vi.mock("@/server/rate-limit/enforce", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@/server/model-catalog/catalog-service", () => ({ getModelCatalog: mocks.catalog }));
vi.mock("@/server/model-catalog/handlers/create-model-catalog", () => ({ createModelCatalogHandler: mocks.create }));
vi.mock("@/server/model-catalog/handlers/update-model-catalog", () => ({ updateModelCatalogHandler: mocks.update }));
vi.mock("@/server/model-catalog/handlers/delete-model-catalog", () => ({ deleteModelCatalogHandler: mocks.remove }));
vi.mock("@/server/model-catalog/space-importer", () => ({ importModelDraftFromSpace: mocks.hf }));
vi.mock("@/server/modal-comfyui/client", async (original) => ({ ...await original<typeof import("@/server/modal-comfyui/client")>(), createModalClient: () => ({ json: mocks.modal }) }));
import { GET, POST } from "./route";
import { PATCH, DELETE } from "./[modelKey]/route";
import { POST as hfImport } from "./import/route";
import { GET as modalList, POST as modalImport } from "./modal-comfyui/route";
import workflows from "@/server/modal-comfyui/fixtures/workflows.json";
import { ModalApiError } from "@/server/modal-comfyui/client";
import { modelCatalogInputSchema } from "@/server/model-catalog/catalog-schema";
const input = { type: "llm", key: "llm-test", label: "Assistant", vendor: "VENDOR", provider: "openai_compatible",
  providerConfig: { base_url: "https://provider.example/v1", model_id: "model", supports_images: false }, parameters: {}, meta: {}, isActive: false, isDefault: false };
const record = () => ({ ...input, id: "model", hasApiKey: true, createdAt: new Date(0), updatedAt: new Date(0), apiKey: "never-return", credential: { ciphertext: "never-return" } });
const context = { params: Promise.resolve({ modelKey: "llm-test" }) };
const request = (method = "GET", body?: unknown, query = "") => new Request("http://localhost/api/external/admin/models?" + query, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ownerEmail: "owner", apiKeyId: "key", permissions: ["platform:admin"] });
  mocks.catalog.mockResolvedValue([record()]);
  mocks.create.mockResolvedValue(record()); mocks.update.mockResolvedValue(record()); mocks.remove.mockResolvedValue(record());
});
it.each([{ permissions: [] }, { permissions: ["platform:read"] }, { permissions: ["platform:write"] }])("refuses all seven operations before catalog/body/import work for $permissions", async ({ permissions }) => {
  mocks.auth.mockResolvedValue({ ownerEmail: "owner", apiKeyId: "key", permissions });
  for (const run of [() => GET(request()), () => POST(request("POST", {})), () => PATCH(request("PATCH", {}), context),
    () => DELETE(request("DELETE"), context), () => hfImport(request("POST", {})), () => modalList(request()), () => modalImport(request("POST", {}))]) {
    const response = await run(); expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ message: "PLATFORM_PERMISSION_REQUIRED" });
  }
  for (const fn of [mocks.catalog, mocks.create, mocks.update, mocks.remove, mocks.hf, mocks.modal]) expect(fn).not.toHaveBeenCalled();
});
it("lists inactive LLM models with explicit safe fields and enforces query validation", async () => {
  const response = await GET(request("GET", undefined, "type=llm&includeInactive=false&q=assistant"));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.items[0]).toMatchObject({ type: "llm", hasApiKey: true, isActive: false, createdAt: new Date(0).toISOString() });
  expect(JSON.stringify(body)).not.toContain("never-return");
  expect(mocks.catalog).toHaveBeenCalledWith({ includeInactive: false, bypassCache: true });
  expect((await GET(request("GET", undefined, "type=unknown"))).status).toBe(400);
});
it("creates with a write-only credential and forwards partial activation and deletion", async () => {
  const response = await POST(request("POST", { ...input, apiKey: "write-only" }));
  expect(response.status).toBe(201); expect(mocks.create).toHaveBeenCalledWith({ ...input, apiKey: "write-only" });
  expect(JSON.stringify(await response.json())).not.toContain("never-return");
  expect((await PATCH(request("PATCH", { isActive: true }), context)).status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith({ key: "llm-test", payload: { isActive: true } });
  expect((await DELETE(request("DELETE"), context)).status).toBe(200); expect(mocks.remove).toHaveBeenCalledWith("llm-test");
});
it("rejects oversized, invalid and unknown writes before mutation and maps safe service errors", async () => {
  expect((await POST(new Request("http://localhost", { method: "POST", headers: { "Content-Length": "1048577" }, body: "{}" }))).status).toBe(413);
  expect((await PATCH(request("PATCH", { credential: "injected" }), context)).status).toBe(400);
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  for (const [error, status, code] of [["MODEL_NOT_FOUND", 404, "NOT_FOUND"], ["MODEL_KEY_EXISTS", 409, "CONFLICT"], ["KEY_IMMUTABLE", 400, "IMMUTABLE_FIELD"], ["MODEL_CREDENTIAL_ENCRYPTION_KEY_INVALID", 503, "MODEL_CREDENTIAL_UNAVAILABLE"]] as const) {
    mocks.update.mockRejectedValueOnce(new Error(error)); const response = await PATCH(request("PATCH", { label: "new" }), context);
    expect(response.status).toBe(status); expect(await response.json()).toMatchObject({ message: code });
  }
});
it("keeps import error responses and drops unknown remote error messages", async () => {
  mocks.hf.mockRejectedValueOnce(new Error("INVALID_SPACE_URL"));
  const invalid = await hfImport(request("POST", { spaceUrl: "http://localhost" }));
  expect(invalid.status).toBe(400); expect(await invalid.json()).toMatchObject({ message: "INVALID_SPACE_URL" });
  mocks.hf.mockRejectedValueOnce(new Error("provider secret=never-return"));
  const failed = await hfImport(request("POST", { spaceUrl: "owner/repo" }));
  expect(failed.status).toBe(400); expect(await failed.json()).toMatchObject({ message: "IMPORT_FAILED" });
  mocks.modal.mockRejectedValueOnce(new ModalApiError("secret=never-return"));
  const modal = await modalList(request()); expect(modal.status).toBe(400); expect(await modal.json()).toMatchObject({ message: "MODAL_CONTRACT_INVALID" });
});
it("imports a valid HF draft with credential fields removed", async () => {
  mocks.hf.mockResolvedValue({ support: { status: "supported" }, spaceId: "owner/repo", apiNames: ["/predict"], resolvedApiName: "/predict", warnings: [],
    draft: { ...input, type: "image", provider: "hf_space", providerConfig: { space_id: "owner/repo", api_name: "/predict", apiKey: "never-return" }, apiKey: "never-return" } });
  const response = await hfImport(request("POST", { spaceUrl: "owner/repo", apiName: "/predict" }));
  expect(response.status).toBe(200); const body = await response.json();
  expect(body.draft.providerConfig).toEqual({ space_id: "owner/repo", api_name: "/predict" });
  expect(JSON.stringify(body)).not.toContain("never-return");
});
it("lists safe Modal metadata and returns an inactive draft that still passes the save schema", async () => {
  mocks.modal.mockResolvedValueOnce({ workflows });
  const listing = await modalList(request()); const items = (await listing.json()).items;
  expect(items).toHaveLength(5); expect(items.every((item: { supported: boolean }) => item.supported)).toBe(true);
  expect(JSON.stringify(items)).not.toContain("providerConfig");
  mocks.modal.mockResolvedValueOnce(workflows[0]);
  const response = await modalImport(request("POST", { workflowId: "krea2-t2i", limits: { max_assets: 4 }, timeoutMs: 120000 }));
  expect(response.status).toBe(200); const { draft } = await response.json();
  expect(draft).toMatchObject({ isActive: false, providerConfig: { connection_id: "default", workflow_id: "krea2-t2i", timeout_ms: 120000, limits: { max_assets: 4 } } });
  expect(modelCatalogInputSchema.safeParse(draft).success).toBe(true);
  expect(mocks.modal).toHaveBeenLastCalledWith("/api/workflows/krea2-t2i");
  expect((await modalImport(request("POST", { workflowId: "../escape" }))).status).toBe(400);
});
