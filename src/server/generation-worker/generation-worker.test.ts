import { beforeEach, describe, expect, it, vi } from "vitest";
const queue = vi.hoisted(() => ({ process: vi.fn(async (options?: { awaitCompletion?: boolean }) => { void options; return 3; }), start: vi.fn(), stop: vi.fn(async () => {}), state: vi.fn(() => ({ started: true })) }));
vi.mock("@/server/job-queue/job-queue-runtime", () => ({
  processSharedQueueJobs: queue.process, startSharedQueueBackground: queue.start, stopSharedQueue: queue.stop, getSharedQueueState: queue.state,
}));
import { processImageJobs, processVideoJobs, processAudioJobs, startGenerationWorker } from "./generation-worker";
import { processAssistantJobs, startAssistantWorker } from "@/server/assistant-executions/assistant-worker";
import { processMediaOperationJobs, startMediaOperationWorker } from "@/server/media-operations/media-operation-worker";
import { processMediaCleanupJobs, startMediaCleanupWorker, processStorageCleanupTask } from "@/server/media-assets/media-cleanup-worker";
describe("legacy worker compatibility entry points", () => {
  beforeEach(() => vi.clearAllMocks());
  it("forwards every family to the same common scheduler", async () => {
    for (const process of [processImageJobs, processVideoJobs, processAudioJobs, processAssistantJobs, processMediaOperationJobs, processMediaCleanupJobs]) {
      expect(await process({ awaitCompletion: false })).toBe(3);
    }
    expect(queue.process).toHaveBeenCalledTimes(6);
    expect(queue.process.mock.calls.every(([options]) => options?.awaitCompletion === false)).toBe(true);
  });
  it("uses one start entry point and rejects direct unfenced cleanup", async () => {
    startGenerationWorker(); startAssistantWorker(); startMediaOperationWorker(); startMediaCleanupWorker();
    expect(queue.start).toHaveBeenCalledTimes(4);
    await expect(processStorageCleanupTask({} as never)).rejects.toThrow("QUEUE_USE_SHARED_RUNNER");
  });
});
