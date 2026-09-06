import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import messages from "@/shared/i18n/messages/en.json";

const mocks = vi.hoisted(() => ({
  updateConfig: vi.fn(),
  prepare: vi.fn().mockResolvedValue(2),
  upload: vi.fn(),
  remove: vi.fn(),
  assets: [] as unknown[],
  selected: null as unknown,
  output: null as unknown,
  inputAssetId: null as string | null,
  connected: false,
}));

vi.mock("../../model/node-authoring-context", () => ({
  useNodeAuthoring: () => ({
    graphId: "graph-1",
    writable: true,
    updateCanonicalNodeConfig: mocks.updateConfig,
    prepareNodeExecution: mocks.prepare,
    getNodeInputAssetId: () => mocks.inputAssetId,
    isNodePortConnected: () => mocks.connected,
  }),
}));

const imageAsset: MediaAssetDto = {
  id: "asset-image",
  version: 1,
  type: "image",
  status: "completed",
  origin: "generation",
  mimeType: "image/png",
  bytes: "12",
  width: 640,
  height: 360,
  durationMs: null,
  sourceOperationId: null,
  url: "https://read.example/image.png",
  createdAt: "2026-09-03T10:00:00.000Z",
  updatedAt: "2026-09-03T10:00:00.000Z",
};
const audioAsset: MediaAssetDto = {
  ...imageAsset,
  id: "asset-audio",
  version: 2,
  type: "audio",
  origin: "media_operation",
  mimeType: "audio/wav",
  width: null,
  height: null,
  durationMs: 3_000,
  sourceOperationId: "operation-audio-1",
  url: "https://read.example/audio.wav",
};
const videoAsset: MediaAssetDto = {
  ...imageAsset,
  id: "asset-video",
  type: "video",
  mimeType: "video/mp4",
  durationMs: 8_000,
  url: "https://read.example/video.mp4",
};

vi.mock("@/features/media-assets/hook/use-media-assets", () => ({
  useMediaAssets: () => ({
    data: { pages: [{ items: mocks.assets, nextCursor: null }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  useMediaAsset: () => ({ data: mocks.selected, isError: false }),
  useUploadMediaAsset: () => ({ mutateAsync: mocks.upload, isPending: false }),
  useDeleteMediaAsset: () => ({ mutateAsync: mocks.remove, isPending: false }),
  useResolvedNodeAssets: () => mocks.output,
}));

vi.mock("react-compare-slider", () => ({
  ReactCompareSlider: ({ itemOne, itemTwo }: { itemOne: React.ReactNode; itemTwo: React.ReactNode }) => <div>{itemOne}{itemTwo}</div>,
  // eslint-disable-next-line @next/next/no-img-element
  ReactCompareSliderImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

import { MediaInputNodeControls, MediaOutputNodeControls } from "./media-node-controls";

function intl(children: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages}>{children}</NextIntlClientProvider>;
}

describe("media Node controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue(imageAsset);
    mocks.remove.mockResolvedValue(undefined);
    mocks.assets = [imageAsset];
    mocks.selected = imageAsset;
    mocks.output = {
      data: {
        nodeId: "gallery-1",
        kind: "output.gallery",
        mediaType: "audio",
        groups: [{ portId: "media", assets: [audioAsset] }],
      },
      isLoading: false,
      isError: false,
    };
    mocks.inputAssetId = null;
    mocks.connected = false;
  });

  it("uploads and stores only the confirmed stable asset id in Input config", async () => {
    render(intl(<MediaInputNodeControls
      id="input-1"
      mediaType="image"
      data={{
        canonicalKind: "input.image",
        configVersion: 1,
        config: { assetId: null },
        selectedOutputAssetId: null,
        ports: [],
        supported: true,
        supportReason: null,
      }}
    />));
    const file = new File(["png"], "frame.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Upload file"), { target: { files: [file] } });

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith({ file, type: "image" }));
    expect(mocks.updateConfig).toHaveBeenCalledWith("input-1", { assetId: "asset-image" });
    expect(JSON.stringify(mocks.updateConfig.mock.calls)).not.toContain("read.example");
  });

  it("opens History in a modal and clears only the Node asset reference", () => {
    render(intl(<MediaInputNodeControls
      id="input-1"
      mediaType="image"
      data={{
        canonicalKind: "input.image",
        configVersion: 1,
        config: { assetId: "asset-image" },
        selectedOutputAssetId: null,
        ports: [],
        supported: true,
        supportReason: null,
      }}
    />));
    expect(screen.queryByRole("dialog", { name: "History assets" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "History assets" }));
    expect(screen.getByRole("dialog", { name: "History assets" })).toHaveAttribute("data-node-banana-component", "HistoryAssetDialog");
    expect(screen.getByRole("dialog", { name: "History assets" })).toHaveClass("z-[10001]");
    expect(document.querySelector("[data-slot='dialog-overlay']")).toHaveClass("z-[10000]");
    fireEvent.click(screen.getByRole("button", { name: "Close history" }));
    expect(screen.queryByRole("dialog", { name: "History assets" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear selected asset" }));
    expect(mocks.updateConfig).toHaveBeenCalledWith("input-1", { assetId: null });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("shows a connected upstream Input asset and disables the preserved local picker", () => {
    mocks.inputAssetId = "asset-upstream";
    mocks.connected = true;
    render(intl(<MediaInputNodeControls
      id="input-relay"
      mediaType="image"
      data={{
        canonicalKind: "input.image",
        configVersion: 1,
        config: { assetId: "asset-local" },
        selectedOutputAssetId: null,
        ports: [],
        supported: true,
        supportReason: null,
      }}
    />));

    expect(screen.getByRole("button", { name: "History assets" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear selected asset" })).toBeDisabled();
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });

  it("restores a durable legacy Audio Edit Gallery item with player, duration, download and History actions", () => {
    const { rerender } = render(intl(<MediaOutputNodeControls id="gallery-1" kind="output.gallery" />));
    expect(document.querySelector("audio")).toHaveAttribute("src", audioAsset.url);
    expect(screen.getByText("0:03")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href", audioAsset.url);
    expect(screen.getByRole("link", { name: "History" })).toHaveAttribute("href", "/history");

    const refreshedAsset = { ...audioAsset, url: "https://read.example/audio-refreshed.wav" };
    mocks.output = {
      data: {
        nodeId: "gallery-1",
        kind: "output.gallery",
        mediaType: "audio",
        groups: [{ portId: "media", assets: [refreshedAsset] }],
      },
      isLoading: false,
      isError: false,
    };
    rerender(intl(<MediaOutputNodeControls id="gallery-1" kind="output.gallery" />));
    expect(document.querySelector("audio")).toHaveAttribute("src", refreshedAsset.url);
  });

  it("renders image and video outputs from their current read URLs", () => {
    mocks.output = {
      data: {
        nodeId: "output-1",
        kind: "output.single",
        mediaType: "image",
        groups: [{ portId: "media", assets: [imageAsset] }],
      },
      isLoading: false,
      isError: false,
    };
    const { rerender } = render(intl(<MediaOutputNodeControls id="output-1" kind="output.single" />));
    expect(document.querySelector("img")).toHaveAttribute("src", imageAsset.url);

    mocks.output = {
      data: {
        nodeId: "gallery-1",
        kind: "output.gallery",
        mediaType: "video",
        groups: [{ portId: "media", assets: [videoAsset] }],
      },
      isLoading: false,
      isError: false,
    };
    rerender(intl(<MediaOutputNodeControls id="gallery-1" kind="output.gallery" />));
    expect(document.querySelector("video")).toHaveAttribute("src", videoAsset.url);
    expect(document.querySelector("video")).toHaveAttribute("controls");
  });

  it("renders accessible empty and error output states", () => {
    mocks.output = {
      data: {
        nodeId: "output-1",
        kind: "output.single",
        mediaType: null,
        groups: [],
      },
      isLoading: false,
      isError: false,
    };
    const { rerender } = render(intl(<MediaOutputNodeControls id="output-1" kind="output.single" />));
    expect(screen.getByText("No connected durable output yet.")).toBeInTheDocument();

    mocks.output = { data: null, isLoading: false, isError: true };
    rerender(intl(<MediaOutputNodeControls id="output-1" kind="output.single" />));
    expect(screen.getByRole("alert")).toHaveTextContent("Connected output could not be loaded.");
  });
});
