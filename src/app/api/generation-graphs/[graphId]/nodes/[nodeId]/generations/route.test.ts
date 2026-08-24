import { GET, POST } from "./route";
import {
  NodeGenerationConfigError,
  NodeGenerationNotFoundError,
  NodeGenerationVersionConflictError,
} from "@/server/generation-graph/node-generation-errors";
import { ImageGenerationActiveNodeError } from "@/server/image-generation/image-generation-submission";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockExecute = vi.hoisted(() => vi.fn());
const mockList = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({ getSession: mockGetSession }));
vi.mock("@/server/generation-graph/node-generation-service", () => ({
  nodeGenerationService: { execute: mockExecute, list: mockList },
}));

const context = {
  params: Promise.resolve({ graphId: "graph-1", nodeId: "node-1" }),
};

describe("node generation route", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockExecute.mockReset();
    mockList.mockReset();
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "owner@example.com",
    });
  });

  it("requires authentication", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("executes a stored Node and returns 202", async () => {
    mockExecute.mockResolvedValue({
      record: { id: "request-1", status: "pending", progress: 0 },
    });
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedGraphVersion: 4 }),
      }),
      context,
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      generation: { requestId: "request-1", status: "pending", progress: 0 },
    });
    expect(mockExecute).toHaveBeenCalledWith(
      "owner@example.com",
      "graph-1",
      "node-1",
      { expectedGraphVersion: 4 },
    );
  });

  it.each([
    [new NodeGenerationNotFoundError(), 404, "GRAPH_NODE_NOT_FOUND"],
    [new NodeGenerationVersionConflictError(), 409, "GRAPH_VERSION_CONFLICT"],
    [new ImageGenerationActiveNodeError(), 409, "NODE_GENERATION_ACTIVE"],
    [new NodeGenerationConfigError({ model: ["inactive"] }), 400, "NODE_CONFIG_INVALID"],
  ])("maps known execution errors", async (error, status, message) => {
    mockExecute.mockRejectedValue(error);
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ expectedGraphVersion: 4 }),
      }),
      context,
    );
    expect(response.status).toBe(status);
    expect((await response.json()).message).toBe(message);
  });

  it("returns owner-scoped generation DTOs", async () => {
    mockList.mockResolvedValue([
      {
        requestId: "request-1",
        status: "completed",
        progress: 100,
        errorMessage: null,
        createdAt: "2026-08-24T10:00:00.000Z",
        modelKey: "model-a",
        images: [{ id: "image-1", url: "https://example.com/1.png", width: 1, height: 1 }],
      },
    ]);
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(200);
    expect((await response.json()).generations[0].images[0].id).toBe("image-1");
    expect(mockList).toHaveBeenCalledWith(
      "owner@example.com",
      "graph-1",
      "node-1",
    );
  });
});
