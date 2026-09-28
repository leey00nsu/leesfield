/**
 * The poll route's two questions.
 *
 * "Is it done?" and "give me what it made" are the same route but not the same
 * request, and holding them to one limit is what cost a finished render: a
 * status poll is a few hundred bytes, while collecting moves every output a job
 * produced. One measured at 73 seconds against Comfy Cloud, well past the 45
 * the client allows a poll — so the download was cut off, retried from nothing,
 * and cut off again.
 *
 * The two limits themselves are the client's, in `comfyAppExecutor`. What this
 * route owes is the split those limits rely on: answering "is it done?" without
 * downloading anything when asked, which is what these cover.
 */

import { NextRequest } from "next/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { ComfyAppDefinition } from "@/lib/comfy/types";

const poll = vi.fn();
const cancel = vi.fn();
const collectRun = vi.fn();

vi.mock("@/lib/comfy/server", () => ({
  engineFromRequest: () => ({ engine: { poll, cancel, label: "Comfy Cloud" } }),
}));

vi.mock("@/lib/comfy/server/run", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/comfy/server/run")>()),
  collectRun,
}));

const { POST } = await import("../poll/route");

const app = {
  id: "app-1",
  name: "App",
  description: "",
  source: "blueprint",
  graph: {},
  inputs: [],
  params: [],
  outputs: [
    { id: "9", label: "Result", type: "image" as const, nodeId: "9", classType: "SaveImage" },
    { id: "1000002", label: "audio", type: "audio" as const, nodeId: "1000002", classType: "SaveAudio" },
  ],
  classTypes: [],
  nodeCount: 0,
  createdAt: 0,
} satisfies ComfyAppDefinition;

const call = (body: Record<string, unknown>) =>
  POST(
    new NextRequest("http://localhost/api/comfy/poll", {
      method: "POST",
      body: JSON.stringify({ jobId: "job-1", app, ...body }),
    })
  );

beforeEach(() => {
  poll.mockReset();
  cancel.mockReset();
  collectRun.mockReset();
});

describe("POST /api/comfy/poll", () => {
  it("reports a finished job without downloading it when asked not to collect", async () => {
    poll.mockResolvedValue({ status: "succeeded", terminal: true, error: null, raw: null });

    const body = await (await call({ collect: false })).json();

    expect(body).toMatchObject({ success: true, polling: false, ready: true });
    expect(body.outputs).toBeUndefined();
    expect(collectRun).not.toHaveBeenCalled();
  });

  it("still answers both questions at once by default", async () => {
    // A script that only wants the result should not have to ask twice.
    poll.mockResolvedValue({ status: "succeeded", terminal: true, error: null, raw: null });
    collectRun.mockResolvedValue([{ handleId: "9", type: "image", value: "data:image/png;base64,AA" }]);

    const body = await (await call({})).json();

    expect(collectRun).toHaveBeenCalledOnce();
    expect(body.outputs).toHaveLength(1);
    expect(body.ready).toBeUndefined();
  });

  it("keeps saying it is running, whether or not collection was asked for", async () => {
    poll.mockResolvedValue({ status: "running", terminal: false, error: null, raw: null });

    const body = await (await call({ collect: false })).json();

    expect(body).toMatchObject({ polling: true, status: "running" });
    expect(body.ready).toBeUndefined();
  });

  it("stops the job, and asks nothing else, when told to cancel", async () => {
    const body = await (await call({ cancel: true })).json();

    expect(cancel).toHaveBeenCalledWith("job-1", expect.anything());
    expect(poll).not.toHaveBeenCalled();
    expect(body).toMatchObject({ success: true, polling: false, status: "cancelled" });
  });

  it("cancels without a contract, because stopping needs no output map", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/comfy/poll", {
        method: "POST",
        body: JSON.stringify({ jobId: "job-1", cancel: true }),
      })
    );

    expect(response.status).toBe(200);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("says what is missing when a poll arrives with no contract", async () => {
    // `nameFailedOutput` and `collectRun` both read it. Without this guard the
    // failure happens inside them and reaches the caller as a bare 500.
    const response = await POST(
      new NextRequest("http://localhost/api/comfy/poll", {
        method: "POST",
        body: JSON.stringify({ jobId: "job-1" }),
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false });
    expect(poll).not.toHaveBeenCalled();
  });

  it("names the output a failed sink belongs to", async () => {
    poll.mockResolvedValue({
      status: "failed",
      terminal: true,
      error: "Comfy Cloud job failed: SaveAudio: input audio is None.",
      errorNodeId: "1000002",
      raw: null,
    });

    const response = await call({ collect: false });
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toContain('"audio" output');
    expect(collectRun).not.toHaveBeenCalled();
  });
});
