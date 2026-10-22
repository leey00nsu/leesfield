import { describe, expect, it } from "vitest";
import { activeMediaOutputPorts, mediaAssetIdsForPort, mediaOutputPorts } from "./media-output";
import { videoFrameOutputPortIds } from "./video-frame-extraction";

describe("frame extraction output modes", () => {
  it("keeps capture provenance out of execution outputs and never aliases a video into a still", () => {
    expect(mediaOutputPorts("input.video").map(port => port.id)).toEqual(["video"]);
    expect(mediaOutputPorts("output.single")).toEqual([]);
    expect(mediaAssetIdsForPort("input.video", "video", "video-asset")).toEqual(["video-asset"]);
    expect(mediaAssetIdsForPort("input.video", "capturedFrame", "video-asset")).toEqual([]);
  });
  it("keeps all canonical ports and chooses only the active execution ports without normalizing config", () => {
    const legacy = { parameters: {} }, point = { parameters: { timestampMs: 0 } };
    expect(mediaOutputPorts("edit.video.extractFrames").map(port => port.id)).toEqual(["startFrame", "endFrame", "frame"]);
    for (const config of [undefined, {}, legacy, { parameters: { timestampMs: undefined } }]) {
      expect(videoFrameOutputPortIds(config)).toEqual(["startFrame", "endFrame"]);
      expect(activeMediaOutputPorts("edit.video.extractFrames", config).map(port => port.id)).toEqual(["startFrame", "endFrame"]);
    }
    for (const timestampMs of [0, 1250, 600_000]) {
      expect(videoFrameOutputPortIds({ parameters: { timestampMs } })).toEqual(["frame"]);
      expect(activeMediaOutputPorts("edit.video.extractFrames", { parameters: { timestampMs } }).map(port => port.id)).toEqual(["frame"]);
    }
    expect(activeMediaOutputPorts("generate.image", point)).toEqual(mediaOutputPorts("generate.image"));
    expect(legacy).toEqual({ parameters: {} });
    expect(point).toEqual({ parameters: { timestampMs: 0 } });
  });

  it("uses exact named bindings and never aliases a selected point frame into legacy ports", () => {
    const point = [{ portId: "frame", assetId: "point", sortOrder: 0 }];
    expect(mediaAssetIdsForPort("edit.video.extractFrames", "frame", "point", point)).toEqual(["point"]);
    for (const port of ["startFrame", "endFrame"]) {
      expect(mediaAssetIdsForPort("edit.video.extractFrames", port, "point", point)).toEqual([]);
    }
    const mixed = [...point, { portId: "startFrame", assetId: "old-start", sortOrder: 0 }, { portId: "endFrame", assetId: "old-end", sortOrder: 0 }];
    expect(mediaAssetIdsForPort("edit.video.extractFrames", "endFrame", "point", mixed)).toEqual(["old-end"]);
    expect(mediaAssetIdsForPort("edit.video.extractFrames", "frame", "old-start", mixed)).toEqual(["point"]);
    expect(mediaAssetIdsForPort("edit.video.extractFrames", "frame", "point", [])).toEqual([]);
  });
});
