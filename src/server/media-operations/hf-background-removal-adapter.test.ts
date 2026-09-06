import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  predict: vi.fn(),
  handleFile: vi.fn((value) => ({ file: value })),
  catalog: vi.fn(),
  resolveBuffer: vi.fn(),
}));

vi.mock("@gradio/client", () => ({
  Client: { connect: mocks.connect },
  handle_file: mocks.handleFile,
}));
vi.mock("@/server/model-catalog/catalog-service", () => ({ getModelCatalog: mocks.catalog }));
vi.mock("@/server/shared/input-image-resolver", () => ({ resolveInputImageBuffer: mocks.resolveBuffer }));

import {
  removeImageBackground,
  resolveBackgroundRemovalProcessor,
} from "./hf-background-removal-adapter";

const model = {
  id: "model-1",
  type: "image",
  key: "remove-bg",
  label: "Remove background",
  vendor: "test",
  provider: "hf_space",
  providerConfig: { space_id: "owner/remove-bg", api_name: "/unused" },
  parameters: {},
  meta: {
    pipeline: "image-to-image",
    model_id: "remove-bg",
    default_width: 1024,
    default_height: 1024,
    default_steps: 1,
    max_input_images: 1,
    operations: {
      background_removal: {
        version: 1,
        api_name: "remove_background",
        input_parameter: "source_image",
        output_mime_type: "image/png",
      },
    },
  },
  isActive: true,
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date(),
} as const;

describe("HF background removal adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.catalog.mockResolvedValue([model]);
    mocks.connect.mockResolvedValue({ predict: mocks.predict });
  });

  it("selects only an active, explicitly capable model", async () => {
    await expect(resolveBackgroundRemovalProcessor()).resolves.toMatchObject({
      modelKey: "remove-bg",
      spaceId: "owner/remove-bg",
      apiName: "/remove_background",
      inputParameter: "source_image",
    });
    mocks.catalog.mockResolvedValue([{ ...model, isActive: false }]);
    await expect(resolveBackgroundRemovalProcessor()).resolves.toBeNull();
  });

  it("uses the capability binding and returns a PNG data URL", async () => {
    mocks.predict.mockResolvedValue({ data: [{ url: "data:image/png;base64,cG5n" }] });
    await expect(removeImageBackground("https://read.example/input.png")).resolves.toEqual({
      dataUrl: "data:image/png;base64,cG5n",
      modelKey: "remove-bg",
    });
    expect(mocks.predict).toHaveBeenCalledWith("/remove_background", {
      source_image: { file: "https://read.example/input.png" },
    });
  });
});
