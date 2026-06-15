import { describe, expect, it } from "vitest";
import { resolveRuntimeParameterLabel } from "@/shared/model-catalog/runtime-utils";

describe("resolveRuntimeParameterLabel", () => {
  it("HF binding이면 provider label을 우선한다", () => {
    expect(
      resolveRuntimeParameterLabel(
        {
          label: "Playback Rate",
          binding: {
            source: "hf_space",
            parameterName: "speed",
          },
        },
        "속도",
      ),
    ).toBe("Playback Rate");
  });

  it("provider label이 없으면 parameterName을 사용한다", () => {
    expect(
      resolveRuntimeParameterLabel(
        {
          binding: {
            source: "hf_space",
            parameterName: "model_size",
          },
        },
        "Model",
      ),
    ).toBe("model_size");
  });

  it("HF binding이 없으면 앱 fallback label을 유지한다", () => {
    expect(
      resolveRuntimeParameterLabel(
        {
          label: "Legacy Speed",
        },
        "속도",
      ),
    ).toBe("속도");
  });
});
