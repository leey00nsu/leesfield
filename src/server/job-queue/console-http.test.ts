// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queueConsoleRead } from "./job-queue-console-http";
const mocks = vi.hoisted(() => ({ session: vi.fn(), audit: vi.fn(), jobs: vi.fn(), overview: vi.fn(), detail: vi.fn(), history: vi.fn(), capabilities: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/server/runtime/env", () => ({ getServerEnv: () => ({ isProduction: true, adminEmail: "admin@example.com", sessionPassword: "unit-test-secret-that-is-at-least-32-characters" }) }));
vi.mock("./job-queue-operations", async original => ({ ...await original<typeof import("./job-queue-operations")>(), auditQueueRejection: mocks.audit }));
vi.mock("./job-queue-console-repository", () => ({ getConsoleOverview: mocks.overview, listConsoleJobs: mocks.jobs }));
vi.mock("./job-queue-console-history", () => ({ getConsoleJob: mocks.detail, getConsoleTimeline: mocks.history,
  listConsoleActions: mocks.history, listConsoleAttempts: mocks.history, listConsoleDeadLetters: mocks.history, listConsoleFailedJobs: mocks.history }));
vi.mock("./job-queue-console-capabilities", () => ({ getConsoleCapabilities: mocks.capabilities }));
const request = (query = "") => new Request("https://leesfield.test/api/internal/job-queue/jobs" + query);
describe("queue console read HTTP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ isLoggedIn: true, adminEmail: "admin@example.com" });
    mocks.jobs.mockResolvedValue({ sampledAt: "2026-10-25T00:00:00Z", items: [], nextCursor: null });
    mocks.overview.mockResolvedValue({ counts: { active: 1 } });
  });
  it("authorizes every request against the configured administrator before reading", async () => {
    for (const session of [{ isLoggedIn: false }, { isLoggedIn: true, adminEmail: "other@example.com" }]) {
      mocks.session.mockResolvedValue(session);
      expect((await queueConsoleRead(request(), "jobs")).status).toBe(401);
    }
    expect(mocks.jobs).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledTimes(2);
  });
  it.each(["?limit=101", "?cursor=malformed", "?limit=1&limit=2", "?kind=unknown", "?payload=secret", "?from=invalid"])("returns a safe 400 before the repository for %s", async query => {
    const response = await queueConsoleRead(request(query), "jobs");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "INVALID_REQUEST" });
    expect(mocks.jobs).not.toHaveBeenCalled();
  });
  it("rejects unused overview filters and sends successful reads with no-store", async () => {
    expect((await queueConsoleRead(request("?limit=1"), "overview")).status).toBe(400);
    const response = await queueConsoleRead(request(), "overview");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("validates IDs/child limits and preserves a missing job as 404", async () => {
    const { Prisma } = await import("@prisma/client");
    expect((await queueConsoleRead(request(), "job", "invalid")).status).toBe(400);
    expect((await queueConsoleRead(request("?limit=101"), "attempts", "00000000-0000-4000-8000-000000000001")).status).toBe(400);
    mocks.detail.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("missing", { code: "P2025", clientVersion: "6" }));
    expect((await queueConsoleRead(request(), "job", "00000000-0000-4000-8000-000000000001")).status).toBe(404);
    expect(mocks.history).not.toHaveBeenCalled();
  });
  it("requires administrator authorization and accepts no operation parameters on capability GET", async () => {
    const id="00000000-0000-4000-8000-000000000001";
    expect((await queueConsoleRead(request("?evidenceRef=https://arbitrary.test"),"capabilities",id)).status).toBe(400);
    expect(mocks.capabilities).not.toHaveBeenCalled();
    mocks.capabilities.mockResolvedValue({entryId:id,redrive:{status:"blocked",reasons:["QUEUE_PAUSED"]}});
    expect((await queueConsoleRead(request(),"capabilities",id)).status).toBe(200);
    mocks.session.mockResolvedValue({isLoggedIn:true,adminEmail:"other@example.com"});
    expect((await queueConsoleRead(request(),"capabilities",id)).status).toBe(401);
    expect(mocks.capabilities).toHaveBeenCalledTimes(1);
  });
});
