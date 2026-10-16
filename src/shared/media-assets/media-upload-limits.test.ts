// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mediaProxyBodyLimit, mediaUploadLimits } from "./media-upload-limits.mjs";

describe("runtime input file limits", () => {
  it("defaults every input medium to 50 MiB independently of output limits", () => {
    expect(mediaUploadLimits({})).toEqual({ image: 52_428_800, video: 52_428_800, audio: 52_428_800 });
  });
  it("reads per-medium server configuration and preserves binary relay capacity", () => {
    const env = { MEDIA_ASSET_MAX_IMAGE_BYTES: "1048576", MEDIA_ASSET_MAX_VIDEO_BYTES: "104857600" };
    expect(mediaUploadLimits(env)).toEqual({ image: 1_048_576, video: 104_857_600, audio: 52_428_800 });
    expect(mediaProxyBodyLimit(env)).toBe(104_857_600);
    expect(mediaProxyBodyLimit({})).toBe(67_108_864);
  });
  it.each(["", "0", "-1", "Infinity", "50mb", "1.5", "9007199254740992"])("normalizes invalid policy %s", value => {
    expect(mediaUploadLimits({ MEDIA_ASSET_MAX_VIDEO_BYTES: value }).video).toBe(52_428_800);
  });
});
