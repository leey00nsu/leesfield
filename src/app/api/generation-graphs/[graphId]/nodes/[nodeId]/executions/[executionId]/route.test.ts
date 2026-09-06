import { DELETE, GET, PATCH } from "./route";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  get: vi.fn(),
  cancel: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/server/node-executions/node-execution-service", () => ({
  nodeExecutionService: { get: mocks.get, cancel: mocks.cancel, update: mocks.update },
}));

const context = {
  params: Promise.resolve({ graphId: "graph-1", nodeId: "node-1", executionId: "request-1" }),
};

describe("node execution detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" });
  });

  it("gets and cancels only through owner, Graph and Node scope", async () => {
    const execution = { executionId: "request-1", status: "processing" };
    mocks.get.mockResolvedValue(execution);
    mocks.cancel.mockResolvedValue({ ...execution, status: "processing" });

    expect((await GET(new Request("http://localhost"), context)).status).toBe(200);
    expect((await DELETE(new Request("http://localhost", { method: "DELETE" }), context)).status).toBe(200);
    expect(mocks.get).toHaveBeenCalledWith(
      "owner@example.com", "graph-1", "node-1", "request-1",
    );
    expect(mocks.cancel).toHaveBeenCalledWith(
      "owner@example.com", "graph-1", "node-1", "request-1",
    );
  });

  it("does not allow anonymous cancellation", async () => {
    mocks.getSession.mockResolvedValue({ isLoggedIn: false });
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), context);
    expect(response.status).toBe(401);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("accepts owner-scoped browser processor progress", async () => {
    mocks.update.mockResolvedValue({ executionId: "request-1", status: "processing", progress: 42 });
    const response = await PATCH(new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "processing", progress: 42 }),
    }), context);
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      "owner@example.com", "graph-1", "node-1", "request-1",
      { status: "processing", progress: 42 },
    );
  });
});
