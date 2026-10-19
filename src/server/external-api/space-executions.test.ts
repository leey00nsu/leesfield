import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ node: vi.fn(), get: vi.fn(), execute: vi.fn(), rows: vi.fn(), lookup: vi.fn(), context: {} }));
vi.mock("./node-execution-history", () => ({ queryNodeExecutionHistory: mocks.rows }));
vi.mock("@/server/node-executions/node-execution-repository", () => ({ nodeExecutionRepository: { getOwnedNode: mocks.node } }));
vi.mock("@/server/node-executions/node-execution-service", () => ({ nodeExecutionService: { get: mocks.get, execute: mocks.execute } }));
vi.mock("@/server/node-executions/external-node-submission", () => ({
  externalNodeSubmission: () => ({ lookup: mocks.lookup, context: mocks.context }),
  ExternalExecutionReplay: class extends Error {},
}));
import { executeExternalNode, listExternalNodeExecutions } from "./space-executions";
const dto = { executionId: "e", executionKind: "generation", mediaType: "image", graphNodeId: "n", status: "completed", progress: 100, errorCode: null, modelKey: "m", outputAssetIds: [], createdAt: new Date().toISOString() };
beforeEach(() => { vi.resetAllMocks(); mocks.node.mockResolvedValue({ kind: "generate.image" }); mocks.get.mockResolvedValue(dto); mocks.rows.mockResolvedValue([{ id: "original", kind: "generate.image", createdAt: new Date() }]); });
it("replays the persisted ID before checking today's graph version or resubmitting", async () => {
  mocks.lookup.mockResolvedValue("original");
  expect(await executeExternalNode("owner", "key", "s", "n", 1, "same")).toEqual(dto);
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.get).toHaveBeenCalledWith("owner", "s", "n", "original", "generate.image");
  mocks.node.mockRejectedValueOnce(new Error("OWNER_MISS"));
  await expect(executeExternalNode("other", "key", "s", "n", 1, "same")).rejects.toThrow("OWNER_MISS");
  expect(mocks.lookup).toHaveBeenCalledTimes(1);
});
it("pages by immutable time and ID, binding cursors to the owner and target", async () => {
  const now = new Date();
  mocks.rows.mockResolvedValueOnce([{ id: "b", kind: "generate.image", createdAt: now }, { id: "a", kind: "generate.video", createdAt: now }]).mockResolvedValue([]);
  const page = await listExternalNodeExecutions("owner", "s", "n", { limit: 1 });
  expect(page.nextCursor).toBeTruthy();
  expect(mocks.rows).toHaveBeenCalledWith("owner", "s", "n", { limit: 2, position: null });
  mocks.node.mockResolvedValue({ kind: "note.memo" });
  await listExternalNodeExecutions("owner", "s", "n", { limit: 1, cursor: page.nextCursor! });
  expect(mocks.rows.mock.calls[1][3].position).toMatchObject({ id: "b" });
  await expect(listExternalNodeExecutions("other", "s", "n", { limit: 1, cursor: page.nextCursor! })).rejects.toThrow();
  await expect(listExternalNodeExecutions("owner", "s", "other-node", { limit: 1, cursor: page.nextCursor! })).rejects.toThrow();
  expect(mocks.rows).toHaveBeenCalledTimes(2);
});
