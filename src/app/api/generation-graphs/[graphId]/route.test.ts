import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.hoisted(() => vi.fn());
const service = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), remove: vi.fn() }));

vi.mock("@/server/auth/session", () => ({ getSession: mockGetSession }));
vi.mock("@/server/generation-graph/generation-graph-service", () => ({
  generationGraphService: service,
}));

import {
  GenerationGraphActiveExecutionError,
  GenerationGraphInputError,
  GenerationGraphNotFoundError,
  GenerationGraphVersionConflictError,
} from "@/server/generation-graph/generation-graph-errors";
import { DELETE, GET, PUT } from "./route";

const context = { params: Promise.resolve({ graphId: "graph_1" }) };

describe("/api/generation-graphs/[graphId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" });
  });

  it("returns 401 before resource access", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(401);
    expect(service.get).not.toHaveBeenCalled();
  });

  it("gets a graph through the authenticated owner scope", async () => {
    service.get.mockResolvedValue({ id: "graph_1", title: "Graph", version: 1 });
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(200);
    expect(service.get).toHaveBeenCalledWith("owner@example.com", "graph_1");
  });

  it("conceals missing and foreign-owned graphs as the same 404", async () => {
    service.get.mockRejectedValue(new GenerationGraphNotFoundError());
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(404);
    expect((await response.json()).message).toBe("GRAPH_NOT_FOUND");
  });

  it("maps invalid snapshots to 400", async () => {
    service.update.mockRejectedValue(new GenerationGraphInputError({ graph: [] }));
    const response = await PUT(
      new Request("http://localhost", { method: "PUT", body: "{}" }),
      context,
    );
    expect(response.status).toBe(400);
  });

  it("maps stale snapshots to 409", async () => {
    service.update.mockRejectedValue(new GenerationGraphVersionConflictError());
    const response = await PUT(
      new Request("http://localhost", { method: "PUT", body: "{}" }),
      context,
    );
    expect(response.status).toBe(409);
    expect((await response.json()).message).toBe("GRAPH_VERSION_CONFLICT");
  });

  it("maps the active execution guard to 409", async () => {
    service.update.mockRejectedValue(new GenerationGraphActiveExecutionError());
    const response = await PUT(
      new Request("http://localhost", { method: "PUT", body: "{}" }),
      context,
    );

    expect(response.status).toBe(409);
    expect((await response.json()).message).toBe("GRAPH_ACTIVE_EXECUTION");
  });

  it("returns the saved graph", async () => {
    service.update.mockResolvedValue({ id: "graph_1", title: "Updated", version: 2 });
    const body = { schemaVersion: 3, groups: [], expectedVersion: 1, title: "Updated", nodes: [], edges: [] };
    const response = await PUT(
      new Request("http://localhost", { method: "PUT", body: JSON.stringify(body) }),
      context,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      graph: { id: "graph_1", title: "Updated", version: 2 },
    });
    expect(service.update).toHaveBeenCalledWith("owner@example.com", "graph_1", body);
  });

  it("deletes an owned graph with no response body", async () => {
    service.remove.mockResolvedValue(undefined);
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), context);
    expect(response.status).toBe(204);
    expect(service.remove).toHaveBeenCalledWith("owner@example.com", "graph_1");
  });
});
