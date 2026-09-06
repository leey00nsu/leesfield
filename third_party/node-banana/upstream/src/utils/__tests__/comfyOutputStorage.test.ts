/**
 * A Comfy node's outputs surviving a save and a reload.
 *
 * A Comfy app can produce several outputs at once, each under its own handle,
 * and they are not all images. The bug this pins down: every one of them was
 * written through the image store while hydration read video and audio back out
 * of the generation store — so a workflow saved with a video output reopened
 * with that output empty, and the node looked like it had never run.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { externalizeWorkflowMedia, hydrateWorkflowMedia } from "../mediaStorage";
import type { WorkflowFile } from "@/types";

const IMAGE = "data:image/png;base64,aW1hZ2U=";
const VIDEO = "data:video/mp4;base64,dmlkZW8=";
const AUDIO = "data:audio/mpeg;base64,YXVkaW8=";

/** What each store was handed, so the save side can be read back per type. */
const written = {
  images: new Map<string, string>(),
  // The kind is recorded alongside the bytes, and a load answers under that
  // field only. A stub that returned the same value as both `video` and `audio`
  // would pass even if hydration read a video out of the audio field — which is
  // the mix-up this file is here to catch.
  generations: new Map<string, { kind: "video" | "audio"; data: string }>(),
};

const app = {
  id: "app-1",
  name: "App",
  description: "",
  source: "upload",
  graph: {},
  inputs: [],
  params: [],
  outputs: [
    { id: "9", label: "Image", type: "image", nodeId: "9", classType: "SaveImage" },
    { id: "10", label: "Video", type: "video", nodeId: "10", classType: "SaveVideo" },
    { id: "11", label: "Audio", type: "audio", nodeId: "11", classType: "SaveAudio" },
    { id: "12", label: "Notes", type: "text", nodeId: "12", classType: "ShowText" },
  ],
  classTypes: [],
  nodeCount: 4,
  createdAt: 0,
};

const workflow = (outputs: Record<string, string>): WorkflowFile =>
  ({
    nodes: [
      {
        id: "comfy-1",
        type: "comfyApp",
        position: { x: 0, y: 0 },
        data: { app, outputs },
      },
    ],
    edges: [],
  }) as unknown as WorkflowFile;

const nodeData = (file: WorkflowFile) =>
  file.nodes[0]!.data as {
    outputs?: Record<string, string>;
    outputRefs?: Record<string, string>;
    outputVideo?: string | null;
    outputAudio?: string | null;
    outputImage?: string | null;
  };

beforeEach(() => {
  written.images.clear();
  written.generations.clear();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, string>) : {};

      if (url.startsWith("/api/workflow-images?")) {
        const id = new URLSearchParams(url.split("?")[1]).get("imageId")!;
        const image = written.images.get(id);
        return new Response(JSON.stringify(image ? { success: true, image } : { success: false }));
      }
      if (url === "/api/workflow-images") {
        written.images.set(body.imageId!, body.imageData!);
        return new Response(JSON.stringify({ success: true, imageId: body.imageId }));
      }
      if (url === "/api/save-generation") {
        written.generations.set(body.imageId!, {
          kind: body.video ? "video" : "audio",
          data: body.video ?? body.audio ?? "",
        });
        return new Response(JSON.stringify({ success: true, imageId: body.imageId }));
      }
      if (url === "/api/load-generation") {
        const stored = written.generations.get(body.imageId!);
        if (!stored) return new Response(JSON.stringify({ success: false, notFound: true }));
        return new Response(JSON.stringify({ success: true, [stored.kind]: stored.data }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a Comfy node's outputs across save and reload", () => {
  it("puts each type in the store hydration reads it back from", async () => {
    const saved = await externalizeWorkflowMedia(
      workflow({ "9": IMAGE, "10": VIDEO, "11": AUDIO, "12": "some notes" }),
      "/tmp/project"
    );
    const data = nodeData(saved);

    // Externalized, so nothing heavy is left inline…
    expect(data.outputs).toEqual({ "12": "some notes" });
    expect(Object.keys(data.outputRefs ?? {}).sort()).toEqual(["10", "11", "9"]);

    // …and each one landed in its own store.
    expect(written.images.get(data.outputRefs!["9"]!)).toBe(IMAGE);
    expect(written.generations.get(data.outputRefs!["10"]!)).toEqual({
      kind: "video",
      data: VIDEO,
    });
    expect(written.generations.get(data.outputRefs!["11"]!)).toEqual({
      kind: "audio",
      data: AUDIO,
    });
  });

  it("brings all three back, and rebuilds the typed mirrors", async () => {
    const saved = await externalizeWorkflowMedia(
      workflow({ "9": IMAGE, "10": VIDEO, "11": AUDIO, "12": "some notes" }),
      "/tmp/project"
    );
    const reloaded = nodeData(await hydrateWorkflowMedia(saved, "/tmp/project"));

    expect(reloaded.outputs).toEqual({
      "9": IMAGE,
      "10": VIDEO,
      "11": AUDIO,
      "12": "some notes",
    });
    expect(reloaded.outputImage).toBe(IMAGE);
    expect(reloaded.outputVideo).toBe(VIDEO);
    expect(reloaded.outputAudio).toBe(AUDIO);
  });

  it("leaves text and remote URLs inline rather than storing them", async () => {
    // A text output is small, and a file per run would be waste; an http URL
    // is already somewhere else and has nothing to externalize.
    const saved = await externalizeWorkflowMedia(
      workflow({ "12": "some notes", "9": "https://example.com/cat.png" }),
      "/tmp/project"
    );
    const data = nodeData(saved);

    expect(data.outputs).toEqual({ "12": "some notes", "9": "https://example.com/cat.png" });
    expect(data.outputRefs).toEqual({});
  });
});
