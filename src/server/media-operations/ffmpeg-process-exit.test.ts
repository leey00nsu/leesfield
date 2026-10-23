// @vitest-environment node
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
const spawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile: spawn }));
import { runVideoProcess } from "./ffmpeg-video-processor";
describe("FFmpeg process exit evidence", () => {
  beforeEach(() => spawn.mockReset());
  it("waits for close after cancellation before reporting stopped work", async () => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    let callback!: (error: Error | null, stdout: string, stderr: string) => void;
    spawn.mockImplementation((_binary, _args, _options, cb) => { callback = cb; return child; });
    const controller = new AbortController();
    const operation = runVideoProcess("ffmpeg", ["-version"], controller.signal);
    let settled = false;
    void operation.then(() => { settled = true; }, () => { settled = true; });
    controller.abort(); callback(new Error("terminated"), "", "");
    await Promise.resolve();
    expect(child.kill).toHaveBeenCalledWith("SIGKILL"); expect(settled).toBe(false);
    child.emit("close", null, "SIGKILL");
    await expect(operation).rejects.toThrow("MEDIA_OPERATION_CANCELLED");
  });
});
