import { GET, POST } from "./route";
import {
  NodeExecutionActiveError,
  NodeExecutionConfigError,
  NodeExecutionStorageUnavailableError,
  NodeExecutionVersionConflictError,
} from "@/server/node-executions/node-execution-errors";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  execute: vi.fn(),
  list: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/server/node-executions/node-execution-service", () => ({
  nodeExecutionService: { execute: mocks.execute, list: mocks.list },
}));

const context = {
  params: Promise.resolve({ graphId: "graph-1", nodeId: "node-1" }),
};

describe("node executions route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" });
  });

  it("requires an authenticated owner", async () => {
    mocks.getSession.mockResolvedValue({ isLoggedIn: false });
    expect((await GET(new Request("http://localhost"), context)).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("starts only the stored Node and returns a provider-neutral 202 DTO", async () => {
    mocks.execute.mockResolvedValue({
      mediaType: "video",
      record: { id: "request-1", status: "pending", progress: 0 },
    });
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedGraphVersion: 7 }),
    }), context);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      execution: {
        executionId: "request-1",
        executionKind: "generation",
        mediaType: "video",
        graphNodeId: "node-1",
        status: "pending",
        progress: 0,
      },
    });
    expect(mocks.execute).toHaveBeenCalledWith(
      "owner@example.com",
      "graph-1",
      "node-1",
      { expectedGraphVersion: 7 },
    );
  });

  it.each([
    [new NodeExecutionVersionConflictError(), 409, "GRAPH_VERSION_CONFLICT"],
    [new NodeExecutionActiveError(), 409, "NODE_GENERATION_ACTIVE"],
    [new NodeExecutionStorageUnavailableError(), 503, "MEDIA_STORAGE_UNAVAILABLE"],
    [new NodeExecutionConfigError({ model: ["inactive"] }), 400, "NODE_CONFIG_INVALID"],
  ])("maps known errors without leaking provider payloads", async (error, status, code) => {
    mocks.execute.mockRejectedValue(error);
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ expectedGraphVersion: 7 }),
    }), context);
    expect(response.status).toBe(status);
    expect((await response.json()).message).toBe(code);
  });

  it("lists owner-scoped executions", async () => {
    mocks.list.mockResolvedValue([{ executionId: "request-1", mediaType: "audio" }]);
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(200);
    expect((await response.json()).executions[0].mediaType).toBe("audio");
    expect(mocks.list).toHaveBeenCalledWith("owner@example.com", "graph-1", "node-1");
  });
});
