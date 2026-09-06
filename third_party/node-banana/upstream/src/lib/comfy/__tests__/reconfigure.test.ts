import { describe, it, expect } from "vitest";

import { mergeParamValues, withAppLabels } from "../reconfigure";
import type { ComfyAppParam, ComfyWidgetCandidate } from "../types";

const candidate = (
  nodeId: string,
  inputKey: string,
  label: string
): ComfyWidgetCandidate => ({
  nodeId,
  inputKey,
  classType: "PrimitiveFloat",
  label,
  valueType: "number",
  currentValue: 0,
  connectableAs: null,
  fromAppMode: false,
});

const param = (id: string, label: string, def?: ComfyAppParam["default"]): ComfyAppParam => ({
  id,
  label,
  nodeId: id.split(":")[0]!,
  inputKey: id.split(":").slice(1).join(":"),
  type: "number",
  ...(def === undefined ? {} : { default: def }),
});

describe("withAppLabels", () => {
  it("replaces a class-derived label with the node's own", () => {
    // A re-derived list has no App Mode, so two PrimitiveFloats read identically.
    const result = withAppLabels(
      {
        widgetCandidates: [
          candidate("4", "value", "PrimitiveFloat · Value"),
          candidate("5", "value", "PrimitiveFloat · Value"),
        ],
      },
      {
        inputs: [],
        params: [param("4:value", "Brightness"), param("5:value", "Contrast")],
      }
    );
    expect(result.widgetCandidates.map((c) => c.label)).toEqual(["Brightness", "Contrast"]);
  });

  it("leaves candidates the app does not expose untouched", () => {
    const result = withAppLabels(
      { widgetCandidates: [candidate("7", "steps", "KSampler · Steps")] },
      { inputs: [], params: [param("4:value", "Brightness")] }
    );
    expect(result.widgetCandidates[0]?.label).toBe("KSampler · Steps");
  });

  it("takes a renamed input's label too", () => {
    const result = withAppLabels(
      { widgetCandidates: [candidate("3", "text", "CLIPTextEncode · Text")] },
      {
        inputs: [
          {
            id: "3:text",
            name: "scene",
            label: "Scene description",
            type: "text",
            nodeId: "3",
            inputKey: "text",
            required: false,
          },
        ],
        params: [],
      }
    );
    expect(result.widgetCandidates[0]?.label).toBe("Scene description");
  });

  it("does not mutate the list it was given", () => {
    const candidates = [candidate("4", "value", "PrimitiveFloat · Value")];
    withAppLabels({ widgetCandidates: candidates }, { inputs: [], params: [param("4:value", "Brightness")] });
    expect(candidates[0]?.label).toBe("PrimitiveFloat · Value");
  });
});

describe("mergeParamValues", () => {
  it("keeps a value the user set on a setting they kept", () => {
    const merged = mergeParamValues([param("7:steps", "Steps", 20)], { "7:steps": 32 });
    expect(merged["7:steps"]).toBe(32);
  });

  it("starts a newly exposed setting at its default", () => {
    const merged = mergeParamValues([param("7:cfg", "CFG", 8)], {});
    expect(merged["7:cfg"]).toBe(8);
  });

  it("drops values for settings the contract no longer has", () => {
    const merged = mergeParamValues([param("7:steps", "Steps", 20)], {
      "7:steps": 32,
      "9:gone": "stale",
    });
    expect(merged).toEqual({ "7:steps": 32 });
  });

  it("preserves a deliberate zero rather than falling back to the default", () => {
    // `0` is falsy and a legitimate brightness — a truthiness check here would
    // silently restore the workflow's own value instead.
    const merged = mergeParamValues([param("5:value", "Contrast", 1)], { "5:value": 0 });
    expect(merged["5:value"]).toBe(0);
  });

  it("leaves a default-less setting unset so the graph keeps the author's value", () => {
    const merged = mergeParamValues([param("7:seed", "Seed")], {});
    expect(merged["7:seed"]).toBeUndefined();
  });
});
