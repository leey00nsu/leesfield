import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConnect = vi.hoisted(() => vi.fn());
const mockGetModelCatalog = vi.hoisted(() => vi.fn());

vi.mock("@gradio/client", () => ({
  Client: {
    connect: mockConnect,
  },
  handle_file: vi.fn((value) => ({ mockedFile: value })),
}));

vi.mock("@/server/model-catalog/catalog-service", () => ({
  getModelCatalog: mockGetModelCatalog,
}));

describe("hfSpaceImageAdapter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("path 기반 HF Space 결과 이미지를 gradio_api/file 경로로 다운로드한다", async () => {
    mockGetModelCatalog.mockResolvedValue([
      {
        id: "image-model-1",
        type: "image",
        key: "hf-image",
        label: "HF Image",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: {
          space_id: "demo/image-space",
          api_name: "/generate_image",
          timeout_ms: 120000,
        },
        parameters: {
          prompt: { ui: "textarea", required: true },
        },
        meta: {
          concurrent_limit: 1,
        },
        isActive: true,
        isDefault: true,
      },
    ]);

    mockConnect.mockResolvedValue({
      predict: vi.fn().mockResolvedValue({
        data: [{ path: "/tmp/generated.png" }],
      }),
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stage: "RUNNING" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "image/png" }),
        arrayBuffer: async () => Uint8Array.from([137, 80, 78, 71]).buffer,
      });
    vi.stubGlobal("fetch", fetchMock);

    const { hfSpaceImageAdapter } = await import(
      "@/server/image-generation/adapters/hf-space-adapter"
    );

    const result = await hfSpaceImageAdapter.generate({
      prompt: "hello image",
      model: "hf-image",
      width: 1024,
      height: 1024,
      imageCount: 1,
      steps: 10,
      seed: "",
      initImages: [],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://demo-image-space.hf.space/gradio_api/file=/tmp/generated.png",
      expect.objectContaining({}),
    );
    expect(result).toEqual({
      images: ["data:image/png;base64,iVBORw=="],
    });
  });

  it("사설망 HTTP 입력 이미지는 fetch 전에 거부한다", async () => {
    mockGetModelCatalog.mockResolvedValue([
      {
        id: "image-model-1",
        type: "image",
        key: "hf-image",
        label: "HF Image",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: {
          space_id: "demo/image-space",
          api_name: "/generate_image",
          timeout_ms: 120000,
        },
        parameters: {
          prompt: { ui: "textarea", required: true },
        },
        meta: {
          concurrent_limit: 1,
        },
        isActive: true,
        isDefault: true,
      },
    ]);

    const predict = vi.fn().mockResolvedValue({
      data: [{ path: "/tmp/generated.png" }],
    });
    mockConnect.mockResolvedValue({ predict });

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ stage: "RUNNING" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { hfSpaceImageAdapter } = await import(
      "@/server/image-generation/adapters/hf-space-adapter"
    );

    await expect(
      hfSpaceImageAdapter.generate({
        prompt: "hello image",
        model: "hf-image",
        width: 1024,
        height: 1024,
        imageCount: 1,
        steps: 10,
        seed: "",
        initImages: ["http://127.0.0.1/private.png"],
      }),
    ).rejects.toThrow("HF_SPACE_IMAGE_INVALID");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(predict).not.toHaveBeenCalled();
  });
});
