import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());
const resolve = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({ getSession }));
vi.mock("@/server/generation-graph/node-output-service", () => ({
  nodeOutputService: { resolve },
}));

import { GET } from "./route";

const context = { params: Promise.resolve({ graphId: "graph-1", nodeId: "output-1" }) };

describe("GET Graph Node outputs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("resolves only inside the session owner scope", async () => {
    getSession.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" });
    resolve.mockResolvedValue({
      nodeId: "output-1",
      kind: "output.gallery",
      mediaType: "audio",
      groups: [],
    });
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(200);
    expect(resolve).toHaveBeenCalledWith("owner@example.com", "graph-1", "output-1");
  });

  it("does not expose output data without a session", async () => {
    getSession.mockResolvedValue({ isLoggedIn: false });
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(401);
    expect(resolve).not.toHaveBeenCalled();
  });
});
