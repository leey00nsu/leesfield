import { describe, expect, it } from "vitest";
import { canonicalNodeKinds } from "./node-registry";
import { isTemporarilyHiddenEditNodeKind, isUnavailableEditNodeKind, temporarilyHiddenEditNodeKinds, unavailableEditNodeKinds } from "./node-availability";

describe("edit availability", () => {
  it("keeps the temporary hidden subset distinct from the six retained retired kinds", () => {
    expect(temporarilyHiddenEditNodeKinds).toEqual(["edit.video.trim", "edit.video.stitch", "edit.image.resize"]);
    expect(unavailableEditNodeKinds.filter(kind => !isTemporarilyHiddenEditNodeKind(kind))).toEqual([
      "edit.image.annotation", "edit.image.removeBackground", "edit.image.splitGrid", "edit.image.gif", "edit.video.frameGrab", "edit.video.easeCurve",
    ]);
    expect(canonicalNodeKinds.filter(kind => !isUnavailableEditNodeKind(kind))).toHaveLength(14);
    for (const kind of temporarilyHiddenEditNodeKinds) expect(isUnavailableEditNodeKind(kind)).toBe(true);
    expect(isTemporarilyHiddenEditNodeKind("edit.image.annotation")).toBe(false);
    expect(isUnavailableEditNodeKind("edit.video.extractFrames")).toBe(false);
    expect(isUnavailableEditNodeKind("future.node")).toBe(false);
  });
});
