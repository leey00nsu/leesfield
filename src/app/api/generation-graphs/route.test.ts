import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.hoisted(() => vi.fn());
const service = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn() }));

vi.mock("@/server/auth/session", () => ({ getSession: mockGetSession }));
vi.mock("@/server/generation-graph/generation-graph-service", () => ({
  generationGraphService: service,
}));

import { GenerationGraphInputError } from "@/server/generation-graph/generation-graph-errors";
import { GET, POST } from "./route";

describe("/api/generation-graphs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" });
  });

  it("returns 401 without an authenticated owner", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });
    const response = await GET();
    expect(response.status).toBe(401);
    expect(service.list).not.toHaveBeenCalled();
  });

  it("lists only through the authenticated owner scope", async () => {
    service.list.mockResolvedValue([{ id: "graph_1", title: "Graph", version: 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      graphs: [{ id: "graph_1", title: "Graph", version: 1 }],
    });
    expect(service.list).toHaveBeenCalledWith("owner@example.com");
  });

  it("creates a graph with a 201 response", async () => {
    service.create.mockResolvedValue({ id: "graph_1", title: "Graph", version: 1 });
    const response = await POST(
      new Request("http://localhost/api/generation-graphs", {
        method: "POST",
        body: JSON.stringify({ title: "Graph" }),
      }),
    );
    expect(response.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith("owner@example.com", { title: "Graph" });
  });

  it("maps input errors to 400", async () => {
    service.create.mockRejectedValue(new GenerationGraphInputError({ fieldErrors: {} }));
    const response = await POST(
      new Request("http://localhost/api/generation-graphs", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe("INVALID_REQUEST");
  });

  it("maps unexpected persistence errors to 500", async () => {
    service.list.mockRejectedValue(new Error("db failed"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect((await response.json()).message).toBe("DB_SAVE_FAILED");
  });
});
