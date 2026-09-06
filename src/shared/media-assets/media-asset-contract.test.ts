import { describe, expect, it } from "vitest";

import {
  createMediaOperationSchema,
  createMediaUploadSchema,
  isAllowedMediaMimeType,
} from "./media-asset-contract";

describe("media asset contracts", () => {
  it("accepts an operation-bound ordered output and normalizes MIME casing", () => {
    expect(
      createMediaUploadSchema.parse({
        intendedType: "audio",
        fileName: "edit.wav",
        declaredMimeType: "AUDIO/WAV",
        declaredBytes: 44,
        operationId: "op_1",
        outputPortId: "audio",
        sortOrder: 0,
      }),
    ).toMatchObject({ declaredMimeType: "audio/wav", operationId: "op_1" });
  });

  it("requires operationId and outputPortId as a pair", () => {
    expect(
      createMediaUploadSchema.safeParse({
        intendedType: "image",
        fileName: "image.png",
        declaredMimeType: "image/png",
        declaredBytes: 24,
        operationId: "op_1",
      }).success,
    ).toBe(false);
  });

  it("rejects traversal file names and unknown request keys", () => {
    expect(
      createMediaUploadSchema.safeParse({
        intendedType: "image",
        fileName: "../image.png",
        declaredMimeType: "image/png",
        declaredBytes: 24,
      }).success,
    ).toBe(false);
    expect(
      createMediaUploadSchema.safeParse({
        intendedType: "image",
        fileName: "image.png",
        declaredMimeType: "image/png",
        declaredBytes: 24,
        url: "https://untrusted.example/image.png",
      }).success,
    ).toBe(false);
  });

  it("keeps operation input order and enforces bounded output counts", () => {
    const parsed = createMediaOperationSchema.parse({
      graphId: "graph_1",
      graphNodeId: "node_1",
      type: "edit.video.stitch",
      configVersion: 1,
      parameters: { repeat: 2 },
      expectedOutputCount: 1,
      inputs: [
        { assetId: "clip_b", portId: "clips", sortOrder: 1 },
        { assetId: "clip_a", portId: "clips", sortOrder: 0 },
      ],
    });
    expect(parsed.inputs.map((input) => input.sortOrder)).toEqual([1, 0]);
    expect(createMediaOperationSchema.safeParse({ ...parsed, type: "edit.audio.basic" }).success).toBe(false);
    expect(
      createMediaOperationSchema.safeParse({ ...parsed, expectedOutputCount: 101 }).success,
    ).toBe(false);
  });

  it("uses a media-specific MIME allowlist", () => {
    expect(isAllowedMediaMimeType("video", "video/mp4")).toBe(true);
    expect(isAllowedMediaMimeType("image", "video/mp4")).toBe(false);
  });
});
