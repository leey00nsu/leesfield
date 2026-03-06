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

describe("hfSpaceVideoAdapter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("path 기반 HF Space 결과 비디오를 gradio_api/file 경로로 다운로드한다", async () => {
    mockGetModelCatalog.mockResolvedValue([
      {
        id: "video-model-1",
        type: "video",
        key: "hf-video",
        label: "HF Video",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: {
          space_id: "demo/video-space",
          api_name: "/generate_video",
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
        data: [{ path: "/tmp/generated.mp4" }],
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
        headers: new Headers({ "content-type": "video/mp4" }),
        arrayBuffer: async () => Uint8Array.from([0, 0, 0, 24]).buffer,
      });
    vi.stubGlobal("fetch", fetchMock);

    const { hfSpaceVideoAdapter } = await import(
      "@/server/video-generation/adapters/hf-space-adapter"
    );

    const result = await hfSpaceVideoAdapter.generate({
      prompt: "hello video",
      model: "hf-video",
      durationSec: 3.5,
      fps: 16,
      guidanceScale: 1,
      steps: 6,
      seed: "",
      aspectRatio: "16:9",
      resolution: 720,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://demo-video-space.hf.space/gradio_api/file=/tmp/generated.mp4",
      expect.objectContaining({}),
    );
    expect(result).toEqual({
      videos: ["data:video/mp4;base64,AAAAGA=="],
      meta: {
        duration_sec: 3.5,
        fps: 16,
      },
    });
  });
});
