import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rate: vi.fn(), execute: vi.fn(), list: vi.fn(),
  service: { get: vi.fn(), cancel: vi.fn(), update: vi.fn() }, node: vi.fn(), output: vi.fn(),
}));
vi.mock("@/server/auth/api-key-guard", () => ({ requireApiKey: mocks.auth }));
vi.mock("@/server/rate-limit/enforce", () => ({ enforceRateLimit: mocks.rate }));
vi.mock("@/server/external-api/space-executions", () => ({ executeExternalNode: mocks.execute, listExternalNodeExecutions: mocks.list,
  readExternalNodeExecution: async (owner: string, graph: string, node: string, id: string, cancel = false) => {
    const { externalNodeExecutionSchema } = await import("@/shared/api/space-executions-contract");
    return externalNodeExecutionSchema.parse(await (cancel ? mocks.service.cancel : mocks.service.get)(owner, graph, node, id));
  },
}));
vi.mock("@/server/node-executions/node-execution-service", () => ({ nodeExecutionService: mocks.service }));
vi.mock("@/server/node-executions/node-execution-repository", () => ({ nodeExecutionRepository: { getOwnedNode: mocks.node } }));
vi.mock("@/server/generation-graph/node-output-service", () => ({ nodeOutputService: { resolve: mocks.output } }));
import { POST, GET as list } from "./[spaceId]/nodes/[nodeId]/executions/route";
import { GET, DELETE, PATCH } from "./[spaceId]/nodes/[nodeId]/executions/[executionId]/route";
import { GET as output } from "./[spaceId]/nodes/[nodeId]/output/route";
import { NodeExecutionVersionConflictError, NodeExecutionQueueFullError } from "@/server/node-executions/node-execution-errors";
const path = "/api/external/spaces/s/nodes/n/executions";
const context = { params: Promise.resolve({ spaceId: "s", nodeId: "n", executionId: "e" }) };
const execution = { executionId: "e", executionKind: "assistant", mediaType: "text", graphNodeId: "n", status: "pending", progress: 0, errorCode: null, modelKey: "model", outputAssetIds: [], createdAt: new Date().toISOString() };
function request(method: string, suffix = "", body?: unknown, key?: string) {
  return new Request("http://localhost" + path + suffix, { method, headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(key === undefined ? {} : { "Idempotency-Key": key }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ownerEmail: "owner", apiKeyId: "key", permissions: ["access:custom", "spaces:read", "spaces:execute", "spaces:update"] });
  mocks.rate.mockResolvedValue(null); mocks.execute.mockResolvedValue(execution);
  mocks.service.get.mockResolvedValue({ ...execution, providerSecret: "hidden" });
  mocks.service.cancel.mockResolvedValue({ ...execution, status: "cancelled" });
  mocks.node.mockResolvedValue({ kind: "generate.assistant" });
  mocks.service.update.mockResolvedValue(execution);
});
describe("external single-node execution boundary", () => {
  it("accepts only the saved graph version and forwards an optional idempotency key", async () => {
    expect((await POST(request("POST", "", { expectedGraphVersion: 1 }, "once"), context)).status).toBe(202);
    expect(mocks.execute).toHaveBeenCalledWith("owner", "key", "s", "n", 1, "once");
    for (const body of [{ expectedGraphVersion: 1, repeatIndex: 1, repeatOfExecutionId: "e" }, { expectedGraphVersion: 1, nodes: [] }]) {
      expect((await POST(request("POST", "", body), context)).status).toBe(400);
    }
    expect((await POST(request("POST", "", { expectedGraphVersion: 1 }, "x".repeat(129)), context)).status).toBe(400);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it("enforces current permissions before submit and retains version/queue errors", async () => {
    mocks.auth.mockResolvedValueOnce({ ownerEmail: "owner", apiKeyId: "key", permissions: ["access:standard"] });
    expect((await POST(request("POST", "", { expectedGraphVersion: 1 }), context)).status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
    mocks.execute.mockRejectedValueOnce(new NodeExecutionVersionConflictError());
    expect((await POST(request("POST", "", { expectedGraphVersion: 1 }), context)).status).toBe(409);
    mocks.execute.mockRejectedValueOnce(new NodeExecutionQueueFullError("GLOBAL_LIMIT"));
    const response = await POST(request("POST", "", { expectedGraphVersion: 1 }), context);
    expect(response.status).toBe(503); expect(response.headers.get("Retry-After")).toBe("30");
  });
  it("projects reads, bounds pages, and cancels using the owner scope", async () => {
    expect(JSON.stringify(await (await GET(request("GET", "/e"), context)).json())).not.toContain("hidden");
    expect((await list(request("GET", "?limit=101"), context)).status).toBe(400);
    expect((await DELETE(request("DELETE", "/e"), context)).status).toBe(200);
    expect(mocks.service.cancel).toHaveBeenCalledWith("owner", "s", "n", "e");
  });
  it("only exposes Assistant selection, rejecting browser completion and extra fields", async () => {
    const selection = { action: "select-item", itemId: "e:2", expectedSelectionVersion: 0 };
    expect((await PATCH(request("PATCH", "/e", selection), context)).status).toBe(200);
    for (const body of [{ action: "complete", outputs: [] }, { ...selection, outputText: "forged" }]) {
      expect((await PATCH(request("PATCH", "/e", body), context)).status).toBe(400);
    }
    mocks.node.mockResolvedValueOnce({ kind: "edit.image.resize" });
    expect((await PATCH(request("PATCH", "/e", selection), context)).status).toBe(400);
    expect(mocks.service.update).toHaveBeenCalledTimes(1);
  });
  it("returns resolved output without exposing internal asset fields", async () => {
    mocks.output.mockResolvedValue({ nodeId: "n", kind: "output.gallery", mediaType: null, groups: [], ownerEmail: "hidden" });
    const response = await output(new Request("http://localhost/api/external/spaces/s/nodes/n/output"), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ output: { nodeId: "n", kind: "output.gallery", mediaType: null, groups: [] } });
  });
});
