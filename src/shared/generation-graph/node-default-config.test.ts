// @vitest-environment node
import { describe, expect, it } from "vitest";
import { defaultConfigForKind } from "./node-default-config";
import { validateNodeConfig } from "./node-registry";

describe("frame extraction authoring defaults", () => {
  it("creates a point at zero while preserving stored legacy parameters exactly", () => {
    expect(defaultConfigForKind("edit.video.extractFrames")).toEqual({ parameters: { timestampMs: 0 } });
    const stored = { parameters: {}, presentation: { customTitle: "Old frames" } };
    expect(validateNodeConfig("edit.video.extractFrames", 1, stored)).toEqual({ supported: true, config: stored });
    expect(stored).toEqual({ parameters: {}, presentation: { customTitle: "Old frames" } });
  });
});
