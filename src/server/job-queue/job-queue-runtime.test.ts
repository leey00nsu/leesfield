// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
vi.hoisted(() => vi.resetModules());
import { createQueueRunner } from "./job-queue-runner";
import { createSharedQueueRuntime } from "./job-queue-runtime";
import { withQueueTransaction } from "./job-queue-transaction";
import { markQueueWorkTx, setQueueWakeup } from "./job-queue-wakeup";
import { QueueContractError } from "./contracts";
import { queueKnownErrorResponse } from "./job-queue-http";

const database = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ prisma: { $transaction: database.transaction } }));
afterEach(() => { setQueueWakeup(() => undefined); vi.clearAllMocks(); });
function setup() {
  const runner = { start: vi.fn(), stop: vi.fn(async () => {}), pump: vi.fn(async () => 1), drain: vi.fn(async () => {}),
    getState: vi.fn(() => ({ started: false, stopping: false, inFlight: 0, running: false, lastHeartbeatAt: null })) };
  const validate = vi.fn(async () => {});
  const runtime = createSharedQueueRuntime(runner as unknown as ReturnType<typeof createQueueRunner>, validate);
  return { runner, validate, runtime };
}
describe("single queue runtime", () => {
  it("validates once before concurrent starts and supports bounded drain", async () => {
    const { runner, validate, runtime } = setup();
    await Promise.all([runtime.start(), runtime.start()]);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(await runtime.pump()).toBe(1); expect(runner.drain).toHaveBeenCalledTimes(1);
    await runtime.stop({ drainTimeoutMs: 12 });
    expect(runner.stop).toHaveBeenCalledWith({ drainTimeoutMs: 12 });
    expect(await runtime.pump()).toBe(0);
  });
  it("does not start after shutdown while schema validation is pending", async () => {
    const { runner, validate, runtime } = setup();
    let release!: () => void;
    validate.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const starting = runtime.start(); await runtime.stop(); release(); await starting;
    expect(runner.start).not.toHaveBeenCalled();
  });
  it("leaves failed schema validation unready and can retry after DB recovery", async () => {
    const { runner, validate, runtime } = setup();
    validate.mockRejectedValueOnce(new Error("DB_UNAVAILABLE"));
    await expect(runtime.start()).rejects.toThrow("DB_UNAVAILABLE");
    expect(runtime.state().schemaReady).toBe(false); expect(runner.start).not.toHaveBeenCalled();
    await runtime.start(); expect(runtime.state().schemaReady).toBe(true);
  });
  it("wakes only after commit and never from a rolled-back enqueue", async () => {
    const wake = vi.fn(); setQueueWakeup(wake);
    const tx = { $executeRaw: vi.fn(async () => 0) };
    database.transaction.mockImplementation(async run => run(tx));
    await withQueueTransaction(async t => { markQueueWorkTx(t); expect(wake).not.toHaveBeenCalled(); });
    await Promise.resolve(); expect(wake).toHaveBeenCalledTimes(1);
    await expect(withQueueTransaction(async t => { markQueueWorkTx(t); throw new Error("ROLLBACK"); })).rejects.toThrow("ROLLBACK");
    await Promise.resolve(); expect(wake).toHaveBeenCalledTimes(1);
  });
  it("maps paused admission to 503 with Retry-After", () => {
    const response = queueKnownErrorResponse(new QueueContractError("QUEUE_PAUSED"));
    expect(response?.status).toBe(503); expect(response?.headers.get("Retry-After")).toBe("30");
  });
});
