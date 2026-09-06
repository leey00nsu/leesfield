import { describe, it, expect } from "vitest";

import { SdkComfyEngine, envelopeNodeId, previewImage } from "@/lib/comfy/server/sdkEngine";
import type { ComfyConnection } from "@/lib/comfy/types";

/**
 * Turning the engine's event stream into the frames a node can draw.
 *
 * The payload is **not** the bare JPEG the SDK's types describe ("SSE `preview`
 * event payload (JPEG, base64, throttled)"). ComfyUI wraps preview images in a
 * binary envelope, and taking that at face value put a broken-image icon in the
 * middle of the node — caught by looking at a real render, not by any test.
 * These lock the real shape down.
 */

const connection: ComfyConnection = {
  mode: "cloud",
  baseUrl: "https://cloud.comfy.org",
  apiKey: "comfyui-test",
  useSdk: true,
  jobTimeoutMs: 60_000,
};

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

/**
 * The shape Comfy Cloud actually sends, verified against a live render:
 * `[uint32 kind=4][uint32 jsonLength][JSON metadata][image bytes]`.
 */
function withMetadata(image: Uint8Array, meta: Record<string, unknown>): Uint8Array {
  const json = Buffer.from(JSON.stringify(meta), "utf8");
  const out = new Uint8Array(8 + json.length + image.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 4);
  view.setUint32(4, json.length);
  out.set(json, 8);
  out.set(image, 8 + json.length);
  return out;
}

/** ComfyUI's older shape: `[uint32 kind=1][uint32 format][image bytes]`. */
function classic(image: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + image.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 1);
  view.setUint32(4, 1);
  out.set(image, 8);
  return out;
}

function engineYielding(events: Array<{ event: string; data: Record<string, unknown> }>) {
  const engine = new SdkComfyEngine(connection);
  const generator = async function* () {
    for (const event of events) yield event;
  };
  Object.defineProperty(engine, "low", {
    get: () => ({ getJobEvents: () => generator() }),
    configurable: true,
  });
  return engine;
}

const collect = async (engine: SdkComfyEngine) => {
  const frames = [];
  for await (const frame of engine.previews("job_1")) frames.push(frame);
  return frames;
};

const preview = (bytes: Uint8Array) => ({
  event: "preview",
  data: { node_id: "", data_base64: Buffer.from(bytes).toString("base64") },
});

describe("previewImage", () => {
  it("digs the image out of the envelope Comfy Cloud sends", () => {
    const found = previewImage(
      withMetadata(JPEG_BYTES, { node_id: "114:81", image_type: "image/jpeg" })
    );
    expect(found?.mime).toBe("image/jpeg");
    expect(found?.bytes).toEqual(JPEG_BYTES);
  });

  it("handles the older envelope a self-hosted engine may send", () => {
    const found = previewImage(classic(PNG_BYTES));
    expect(found?.mime).toBe("image/png");
    expect(found?.bytes).toEqual(PNG_BYTES);
  });

  it("passes through bytes that are already an image", () => {
    const found = previewImage(JPEG_BYTES);
    expect(found?.mime).toBe("image/jpeg");
    expect(found?.bytes).toEqual(JPEG_BYTES);
  });

  it("finds nothing in something that is not image-shaped", () => {
    // A broken-image icon in the middle of the node is worse than the spinner
    // it replaced, so an unrecognised payload has to read as "no preview".
    expect(previewImage(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(previewImage(withMetadata(new Uint8Array([9, 9, 9]), {}))).toBeNull();
  });

  it("does not read past the end of a truncated envelope", () => {
    const bytes = new Uint8Array(12);
    new DataView(bytes.buffer).setUint32(0, 4);
    new DataView(bytes.buffer).setUint32(4, 9999);
    expect(previewImage(bytes)).toBeNull();
  });
});

describe("envelopeNodeId", () => {
  it("reads the node id the frame itself leaves empty", () => {
    const bytes = withMetadata(JPEG_BYTES, { node_id: "114:81" });
    expect(envelopeNodeId(bytes)).toBe("114:81");
  });

  it("returns nothing when there is no metadata to read", () => {
    expect(envelopeNodeId(classic(JPEG_BYTES))).toBeNull();
    expect(envelopeNodeId(JPEG_BYTES)).toBeNull();
  });
});

describe("previews", () => {
  it("yields a data URL an img can show, and the node it came from", async () => {
    const frames = await collect(
      engineYielding([preview(withMetadata(JPEG_BYTES, { node_id: "114:81" }))])
    );

    expect(frames).toHaveLength(1);
    expect(frames[0]!.nodeId).toBe("114:81");
    expect(frames[0]!.dataUrl).toBe(
      `data:image/jpeg;base64,${Buffer.from(JPEG_BYTES).toString("base64")}`
    );
  });

  it("falls back to the frame's own node id when the envelope carries none", async () => {
    // The classic envelope has no metadata to read, so the frame field is all
    // there is. On Cloud it arrives empty and the metadata wins; on a
    // self-hosted engine it is the other way round.
    const frames = await collect(
      engineYielding([
        {
          event: "preview",
          data: {
            node_id: "42",
            data_base64: Buffer.from(classic(JPEG_BYTES)).toString("base64"),
          },
        },
      ])
    );

    expect(frames).toHaveLength(1);
    expect(frames[0]!.nodeId).toBe("42");
  });

  it("ignores everything that is not a preview", async () => {
    // Progress in particular: it rides the same stream, and it is the thing we
    // deliberately do not draw.
    const frames = await collect(
      engineYielding([
        { event: "progress", data: { value: 0.5 } },
        { event: "status", data: { status: "running" } },
        { event: "log", data: { level: "info", message: "hello" } },
        preview(withMetadata(JPEG_BYTES, { node_id: "9" })),
      ])
    );

    expect(frames).toHaveLength(1);
  });

  it("drops a frame it cannot make an image of", async () => {
    const frames = await collect(
      engineYielding([
        { event: "preview", data: { node_id: "9", data_base64: "" } },
        preview(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])),
      ])
    );

    expect(frames).toEqual([]);
  });
});
