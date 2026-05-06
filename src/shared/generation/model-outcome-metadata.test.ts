import { describe, expect, it } from "vitest";
import { resolveModelOutcomeMetadata } from "@/shared/generation/model-outcome-metadata";

describe("resolveModelOutcomeMetadata", () => {
  it("returns a known outcome profile for a creative image model", () => {
    expect(
      resolveModelOutcomeMetadata({
        key: "flux2-klein-9b",
        type: "image",
        modalities: ["T2I", "I2I"],
      }),
    ).toMatchObject({
      profile: "imageEditorial",
      tone: "image",
      tags: ["T2I", "I2I"],
      strengthKeys: ["reference", "detail"],
    });
  });

  it("falls back by modality when the model key is unknown", () => {
    expect(
      resolveModelOutcomeMetadata({
        key: "custom-video-model",
        type: "video",
        modalities: [],
      }),
    ).toMatchObject({
      profile: "videoDefault",
      tone: "video",
      tags: ["T2V"],
    });
  });
});
