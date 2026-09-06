import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), copy: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/server/generation-graph/generation-graph-service", () => ({ generationGraphService: { copy: mocks.copy } }));
import { GenerationGraphNotFoundError } from "@/server/generation-graph/generation-graph-errors";
import { POST } from "./route";

const context = { params: Promise.resolve({ graphId: "source" }) };
describe("Space copy API", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" }); });
  it("rejects unauthenticated requests before reading the source", async () => {
    mocks.session.mockResolvedValue({ isLoggedIn: false });
    expect((await POST(new Request("http://localhost", { method: "POST" }), context)).status).toBe(401);
    expect(mocks.copy).not.toHaveBeenCalled();
  });
  it("uses only the authenticated owner, not a body-supplied owner", async () => {
    mocks.copy.mockResolvedValue({ id: "copy" });
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ ownerEmail: "foreign@example.com" }) }), context);
    expect(mocks.copy).toHaveBeenCalledWith("owner@example.com", "source");
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ graph: { id: "copy" } });
  });
  it("does not disclose a foreign or missing source", async () => {
    mocks.copy.mockRejectedValue(new GenerationGraphNotFoundError());
    expect((await POST(new Request("http://localhost", { method: "POST" }), context)).status).toBe(404);
  });
});
