// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  predict: vi.fn(),
  upload: vi.fn(),
  handleFile: vi.fn((value) => value),
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

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64");
const sdkRoot = "https://actual-remove-bg.hf.space";

describe("HF background removal adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.catalog.mockResolvedValue([model]);
    mocks.connect.mockResolvedValue({ predict: mocks.predict, upload_files: mocks.upload, config: { root: sdkRoot } });
    mocks.upload.mockResolvedValue({ files: ["/uploaded/reference.png"] });
    mocks.resolveBuffer.mockResolvedValue({ buffer: png, mime: "image/png" });
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
      source_image: expect.objectContaining({ path: "/uploaded/reference.png", orig_name: "reference.png", mime_type: "image/png" }),
    });
    expect(mocks.upload).toHaveBeenCalledWith(sdkRoot, [expect.objectContaining({ name: "reference.png", type: "image/png" })]);
    mocks.predict.mockResolvedValue({ data: [{ path: "/tmp/output.png" }] });
    await expect(removeImageBackground("https://read.example/input.png")).resolves.toEqual({
      dataUrl: "data:image/png;base64," + png.toString("base64"),
      modelKey: "remove-bg",
    });
    expect(mocks.resolveBuffer).toHaveBeenLastCalledWith(sdkRoot + "/gradio_api/file=/tmp/output.png", expect.any(Object));
  });
});
