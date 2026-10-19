// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rate: vi.fn(),
  service: { create: vi.fn(), get: vi.fn(), update: vi.fn(), copy: vi.fn(), remove: vi.fn() }, list: vi.fn(),
}));
vi.mock("@/server/auth/api-key-guard", () => ({ requireApiKey: mocks.auth }));
vi.mock("@/server/rate-limit/enforce", () => ({ enforceRateLimit: mocks.rate }));
vi.mock("@/server/generation-graph/generation-graph-service", () => ({ generationGraphService: mocks.service }));
vi.mock("@/server/external-api/spaces-page", () => ({ listExternalSpaces: mocks.list }));
import { POST, GET } from "./route";
import { PUT, GET as detail, DELETE } from "./[spaceId]/route";
import { POST as copy } from "./[spaceId]/copy/route";
import { GenerationGraphNotFoundError, GenerationGraphVersionConflictError } from "@/server/generation-graph/generation-graph-errors";
const graph = { id: "space", title: "Space", version: 2, schemaVersion: 3, minimumWriterVersion: 3, nodes: [], edges: [], groups: [],
  outputBindings: [], writable: true, readOnlyReason: null, createdAt: new Date(), updatedAt: new Date(), ownerEmail: "must-be-stripped" };
const context = { params: Promise.resolve({ spaceId: "space" }) };
function req(method: string, path = "", body?: unknown) {
  return new Request("http://localhost/api/external/spaces" + path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ownerEmail: "owner@example.com", apiKeyId: "key", permissions: ["access:custom", "spaces:read", "spaces:create", "spaces:update", "spaces:delete"] });
  mocks.rate.mockResolvedValue(null);
  mocks.service.create.mockResolvedValue(graph); mocks.service.get.mockResolvedValue(graph); mocks.service.update.mockResolvedValue(graph); mocks.service.copy.mockResolvedValue(graph);
});
describe("external space management without session authentication", () => {
  it("checks permission before media type and rejects plain text before mutation", async () => {
    const request = () => new Request("http://localhost/api/external/spaces", { method: "POST", body: '{"title":"New"}', headers: { "Content-Type": "text/plain" } });
    const rejected = await POST(request());
    expect(rejected.status).toBe(415);
    expect(await rejected.json()).toEqual({ message: "UNSUPPORTED_MEDIA_TYPE" });
    expect(mocks.service.create).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue({ ownerEmail: "owner", apiKeyId: "key", permissions: ["access:custom"] });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.service.create).not.toHaveBeenCalled();
  });
  it("creates and reads the same owned space with an explicit public DTO", async () => {
    const response = await POST(req("POST", "", { title: "New" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ space: { id: "space", nodes: [] } });
    expect(mocks.service.create).toHaveBeenCalledWith("owner@example.com", { title: "New" });
    expect(JSON.stringify(await (await detail(req("GET", "/space"), context)).json())).not.toContain("must-be-stripped");
  });
  it("rejects invalid queries and body fields before changing a space", async () => {
    expect((await GET(req("GET", "?limit=101"))).status).toBe(400);
    expect((await POST(req("POST", "", { title: "x", ownerEmail: "other" }))).status).toBe(400);
    expect(mocks.service.create).not.toHaveBeenCalled();
  });
  it("keeps version conflicts and owner misses explicit", async () => {
    mocks.service.update.mockRejectedValue(new GenerationGraphVersionConflictError());
    expect((await PUT(req("PUT", "/space", { schemaVersion: 3, expectedVersion: 1, title: "x", nodes: [], edges: [], groups: [] }), context)).status).toBe(409);
    mocks.service.get.mockRejectedValue(new GenerationGraphNotFoundError());
    expect((await detail(req("GET", "/space"), context)).status).toBe(404);
  });
  it("does not accept fabricated browser execution placeholders", async () => {
    const nodes = [{ id: "fake", kind: "input.image", configVersion: 1, position: { x:0,y:0 }, selectedOutputAssetId: null,
      config: { assetId: "fake-asset", resultSource: { nodeId: "source", executionId: "fake-execution", portId: "image", index: 0, state: "completed" } } }];
    expect((await PUT(req("PUT", "/space", { schemaVersion: 3, expectedVersion: 2, title: "x", nodes, edges: [], groups: [] }), context)).status).toBe(400);
    expect(mocks.service.update).not.toHaveBeenCalled();
  });
  it("copies using both permissions and returns an empty successful delete", async () => {
    expect((await copy(req("POST", "/space/copy"), context)).status).toBe(201);
    const response = await DELETE(req("DELETE", "/space"), context);
    expect(response.status).toBe(204); expect(await response.text()).toBe("");
  });
});
