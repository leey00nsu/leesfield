// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queueAdminMutation, queueAdminBatch, queueAdminRead } from "./job-queue-admin-http";

const mocks = vi.hoisted(() => ({ session: vi.fn(), operation: vi.fn(), audit: vi.fn(), limit: vi.fn(), list: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/server/runtime/env", () => ({ getServerEnv: () => ({ isProduction: true, adminEmail: "admin@example.com",
  appOrigin: "https://leesfield.test", sessionPassword: "unit-test-secret-that-is-at-least-32-characters" }) }));
vi.mock("@/server/rate-limit/enforce", () => ({ enforceRateLimit: mocks.limit }));
vi.mock("./job-queue-operations", async original => ({
  ...await original<typeof import("./job-queue-operations")>(), operateQueue: mocks.operation, auditQueueRejection: mocks.audit,
}));
vi.mock("./job-queue-dlq", () => ({ listQueueDeadLetters: mocks.list, getQueueDeadLetter: mocks.list }));
describe("DLQ administrator HTTP boundary", () => {
  const id = randomUUID();
  const command = () => ({ requestId: randomUUID(), expectedVersion: 0, reason: "CAUSE_FIXED" });
  function request(body = command(), origin = "https://leesfield.test") {
    return new Request("https://leesfield.test/api/internal/job-queue/dead-letters/" + id + "/redrive", {
      method: "POST", headers: { "Content-Type": "application/json", cookie: "leesfield_session=test", origin }, body: JSON.stringify(body),
    });
  }
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ isLoggedIn: true, adminEmail: "admin@example.com" });
    mocks.limit.mockResolvedValue(null);
    mocks.operation.mockResolvedValue({ requestId: randomUUID(), outcome: "succeeded", result: {} });
    mocks.list.mockResolvedValue({ items: [{ sequence: BigInt(1) }], nextCursor: null });
  });
  it("requires the configured administrator and audits a mismatched logged-in account", async () => {
    mocks.session.mockResolvedValue({ isLoggedIn: true, adminEmail: "someone@example.com" });
    expect((await queueAdminMutation(request(), id, "redrive")).status).toBe(401);
    expect(mocks.operation).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith("someone@example.com", "redrive", "QUEUE_ADMIN_REQUIRED");
    expect((await queueAdminRead(new Request("https://leesfield.test/api/internal/job-queue/dead-letters"))).status).toBe(401);
  });
  it("rejects cross-origin session mutations before execution", async () => {
    expect((await queueAdminMutation(request(command(), "https://evil.test"), id, "redrive")).status).toBe(403);
    expect(mocks.operation).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith("admin@example.com", "redrive", "QUEUE_ORIGIN_REJECTED");
  });
  it("applies the per-actor and cluster mutation budget and audits refusals", async () => {
    mocks.limit.mockResolvedValueOnce(null).mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect((await queueAdminMutation(request(), id, "abandon")).status).toBe(429);
    expect(mocks.limit.mock.calls.map(c => c[0].capacity)).toEqual([10, 30]);
    expect(mocks.operation).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith("admin@example.com", "abandon", "QUEUE_RATE_LIMITED");
  });
  it("uses the server actor and preserves rejected-operation status", async () => {
    mocks.operation.mockResolvedValue({ outcome: "rejected", result: { code: "QUEUE_VERSION_CONFLICT" } });
    const body = command();
    expect((await queueAdminMutation(request(body), id, "redrive")).status).toBe(409);
    expect(mocks.operation).toHaveBeenCalledWith("admin@example.com", "redrive", id, body);
  });
  it("bounds bulk requests at twenty and returns individual outcomes", async () => {
    const bulk = (n: number) => new Request("https://leesfield.test/api/internal/job-queue/dead-letters/batch", {
      method: "POST", headers: { cookie: "leesfield_session=test", origin: "https://leesfield.test" },
      body: JSON.stringify({ action: "redrive", items: Array.from({ length: n }, () => ({ ...command(), id: randomUUID() })) }),
    });
    expect((await queueAdminBatch(bulk(21))).status).toBe(400);
    expect(mocks.operation).not.toHaveBeenCalled();
    const response = await queueAdminBatch(bulk(2));
    expect(response.status).toBe(200);
    expect((await response.json()).items).toHaveLength(2);
    expect(mocks.operation).toHaveBeenCalledTimes(2);
  });
  it("returns safe paginated data with lossless sequence strings and no caching", async () => {
    const response = await queueAdminRead(new Request("https://leesfield.test/api/internal/job-queue/dead-letters"));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).items[0].sequence).toBe("1");
  });
});
