import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/prisma", () => ({ prisma: {} }));

import {
  applyUploadedGenerationInputAssets,
  generationInputMediaForPayload,
} from "./input-media-uploader";

describe("generation input media normalization", () => {
  it("rejects more than eight remote inputs before downloading them", () => {
    expect(() =>
      generationInputMediaForPayload(
        "image",
        {
          initImages: Array.from(
            { length: 9 },
            (_, index) => `https://example.com/${index}.png`,
          ),
        },
        { type: "image" },
      ),
    ).toThrow("INPUT_MEDIA_COUNT_LIMIT");
  });

  it("maps core and catalog upload fields to stable durable reference fields", () => {
    const inputs = generationInputMediaForPayload(
      "image",
      {
        initImages: ["data:image/png;base64,a", "https://example.com/b.png"],
        dynamicParams: { reference: ["https://example.com/reference.png"] },
      },
      {
        type: "image",
        parameters: {
          reference: { ui: "upload", media: "image" },
        },
      },
    );
    expect(inputs).toEqual([
      {
        field: "initImages",
        mediaType: "image",
        generationType: "image",
        sources: ["data:image/png;base64,a", "https://example.com/b.png"],
        multiple: true,
      },
      {
        field: "dynamicParams.reference",
        mediaType: "image",
        generationType: "image",
        sources: ["https://example.com/reference.png"],
        multiple: false,
      },
    ]);
  });

  it("maps a generic core image to the mapped contract only once", () => {
    const inputs = generationInputMediaForPayload(
      "image",
      { initImages: ["https://example.com/input.png"] },
      {
        type: "image",
        providerConfig: { api_name: "/generate", output: { media: "image", path: [0] } },
        parameters: {
          input_image: {
            ui: "upload",
            binding: {
              source: "hf_space",
              parameterName: "input_image",
              valueType: "file",
              kind: "file",
              media: "image",
            },
          },
        },
      },
    );

    expect(inputs).toEqual([
      {
        field: "dynamicParams.input_image",
        mediaType: "image",
        generationType: "image",
        sources: ["https://example.com/input.png"],
        multiple: false,
      },
    ]);
  });

  it("clears the duplicate generic field after a mapped contract upload", () => {
    const payload = {
      initImages: ["data:image/png;base64,raw"],
      dynamicParams: { input_image: "data:image/png;base64,raw" },
    };
    const result = applyUploadedGenerationInputAssets(payload, [
      {
        ref: {
          assetId: "asset-contract",
          field: "dynamicParams.input_image",
          sortOrder: 0,
          generationType: "image",
        },
        url: "https://cdn/input.png",
        mediaType: "image",
      },
    ]);

    expect(result).toEqual({
      initImages: [],
      dynamicParams: { input_image: "https://cdn/input.png" },
    });
  });

  it("applies durable URLs without mutating the submitted payload", () => {
    const payload = {
      initImages: ["old"],
      dynamicParams: { reference: "old-reference", prompt: "keep" },
    };
    const result = applyUploadedGenerationInputAssets(payload, [
      { ref: { assetId: "asset-b", field: "initImages", sortOrder: 1, multiple: true, generationType: "image" }, url: "https://cdn/b", mediaType: "image" },
      { ref: { assetId: "asset-a", field: "initImages", sortOrder: 0, multiple: true, generationType: "image" }, url: "https://cdn/a", mediaType: "image" },
      { ref: { assetId: "asset-r", field: "dynamicParams.reference", sortOrder: 0, generationType: "image" }, url: "https://cdn/reference", mediaType: "image" },
    ]);
    expect(result).toEqual({
      initImages: ["https://cdn/a", "https://cdn/b"],
      dynamicParams: { reference: "https://cdn/reference", prompt: "keep" },
    });
    expect(payload).toEqual({
      initImages: ["old"],
      dynamicParams: { reference: "old-reference", prompt: "keep" },
    });
  });
});
