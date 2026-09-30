import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";

import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import messages from "@/shared/i18n/messages/en.json";
import { ReactFlowProvider } from "@xyflow/react";
import { useState } from "react";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";

const mocks = vi.hoisted(() => ({
  updateConfig: vi.fn(),
  refetch: vi.fn(),
  start: vi.fn(),
  select: vi.fn(),
  browser: vi.fn(),
  cancel: vi.fn(),
  ready: true,
  executionData: [] as Array<Record<string, unknown>>,
  clips: [] as string[],
}));

vi.mock("@/features/media-assets/hook/use-media-assets", () => ({
  mediaAssetKeys: { all: ["media-assets"] },
  useMediaAsset: () => ({ data: null }),
  useMediaAssetList: (ids: string[]) => ids.map((id) => ({
    data: { id, type: "video", url: `https://example.com/${id}.mp4`, durationMs: 2000 },
  })),
}));

vi.mock("../../lib/browser-video-operation-runner", () => ({ runBrowserVideoOperation: mocks.browser }));

vi.mock("../../model/node-authoring-context", () => ({
  useNodeAuthoring: () => ({
    graphId: "graph-1",
    prepareNodeExecution: vi.fn().mockResolvedValue(1),
    writable: true,
    updateCanonicalNodeConfig: mocks.updateConfig,
    selectNodeOutputAsset: mocks.select,
    getNodeInputAssetIds: () => mocks.clips,
    getNodeRunReadiness: () => ({ ready: mocks.ready, reasons: mocks.ready ? [] : ["input_missing"] }),
  }),
}));

vi.mock("../../hook/use-node-executions", () => ({
  useNodeExecutions: () => ({ data: mocks.executionData, isError: false, refetch: mocks.refetch }),
  useStartNodeExecution: () => ({ mutateAsync: mocks.start, isPending: false, isError: false }),
  useCancelNodeExecution: () => ({ mutateAsync: mocks.cancel, isPending: false, isError: false }),
}));

import { VideoOperationNodeControls } from "./video-operation-node-controls";
import { VideoTrimEditor } from "./video-trim-editor";

function renderControls(
  kind: Parameters<typeof VideoOperationNodeControls>[0]["kind"],
  parameters: Record<string, CanonicalJsonValue>,
  clipEdgeIds: string[] = [],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui = () => (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ReactFlowProvider>
        <VideoOperationNodeControls
          id="video-operation-1"
          kind={kind}
          clipEdgeIds={clipEdgeIds}
          data={{
            canonicalKind: kind,
            configVersion: 1,
            config: { parameters },
            selectedOutputAssetId: null,
            ports: [],
            supported: true,
            supportReason: null,
          }}
        />
        </ReactFlowProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const result = render(ui());
  return { ...result, redraw: () => result.rerender(ui()) };
}

describe("VideoOperationNodeControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executionData = [];
    mocks.clips = [];
    mocks.ready = true;
    mocks.cancel.mockResolvedValue(undefined);
    mocks.start.mockResolvedValue({ executionId: "server-1", plan: undefined });
  });

  it("persists stripAudio only after an explicit Stitch checkbox change", () => {
    renderControls("edit.video.stitch", { repeat: 2, stripAudio: false });

    expect(screen.getByRole("spinbutton", { name: "Sequence repeat" })).toHaveValue(2);
    const stripAudio = screen.getByRole("switch", {
      name: "Remove all source and soundtrack audio",
    });
    expect(stripAudio).not.toBeChecked();

    fireEvent.click(stripAudio);
    expect(mocks.updateConfig).toHaveBeenCalledWith("video-operation-1", {
      parameters: { repeat: 2, stripAudio: true },
    });
  });

  it("restores and updates an explicit custom Ease Curve config", () => {
    renderControls("edit.video.easeCurve", {
      outputDurationMs: 2_500,
      easingPreset: null,
      bezier: [0.1, 0.2, 0.8, 0.9],
    });

    expect(screen.getByRole("combobox", { name: "Curve" })).toHaveTextContent("Custom bezier");
    expect(screen.getByRole("spinbutton", { name: "Output (s)" })).toHaveValue(2.5);

    fireEvent.change(screen.getByRole("spinbutton", { name: "Bezier 2" }), {
      target: { value: "0.3" },
    });
    expect(mocks.updateConfig).toHaveBeenCalledWith("video-operation-1", {
      parameters: {
        outputDurationMs: 2_500,
        easingPreset: null,
        bezier: [0.1, 0.3, 0.8, 0.9],
      },
    });
  });

  it.each(["edit.video.stitch", "edit.video.trim"] as const)("runs %s from the generation header and selects the completed video", async (kind) => {
    mocks.ready = false;
    const { container, redraw } = renderControls(kind, {
      repeat: 1, stripAudio: false, clipOrder: [],
    });
    const run = container.querySelector<HTMLButtonElement>('button[data-canvas-action="run"]');
    expect(run).not.toBeNull();
    expect(run!.closest('[data-node-banana-component="FloatingNodeHeader"]')).not.toBeNull();
    expect(container.querySelector("[data-node-run]")).toBeNull();
    expect(run).toBeDisabled();
    mocks.ready = true;
    redraw();
    expect(run).toBeEnabled();
    fireEvent.click(run!);
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith({
      graphId: "graph-1", nodeId: "video-operation-1", expectedGraphVersion: 1,
    }));
    expect(mocks.browser).not.toHaveBeenCalled();
    mocks.executionData = [{ executionId: "server-1", executionKind: "media_operation", status: "processing", progress: 30, outputAssetIds: [] }];
    redraw();
    expect(run).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel operation" }));
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith({
      graphId: "graph-1", nodeId: "video-operation-1", executionId: "server-1",
    }));
    mocks.executionData = [{ executionId: "server-1", executionKind: "media_operation",
      status: "completed", outputAssetIds: ["finished-video"], progress: 100 }];
    redraw();
    expect(run).toBeEnabled();
    await waitFor(() => expect(mocks.select).toHaveBeenCalledWith("video-operation-1", "finished-video"));
  });

  it("persists a reordered Stitch clip list by stable edge IDs", () => {
    mocks.clips = ["clip-a", "clip-b"];
    renderControls("edit.video.stitch", { repeat: 1, stripAudio: false, clipOrder: [] }, ["edge-a", "edge-b"]);
    fireEvent.click(screen.getByRole("button", { name: "Move video 2 earlier" }));
    expect(mocks.updateConfig).toHaveBeenCalledWith("video-operation-1", {
      parameters: { repeat: 1, stripAudio: false, clipOrder: ["edge-b", "edge-a"] },
    });
  });
});

describe("Video Trim timeline", () => {
  const source = { id: "source", type: "video", url: "https://example.com/source.mp4", durationMs: 4000 } as MediaAssetDto;
  const output = { id: "result", type: "video", url: "https://example.com/result.mp4", durationMs: 2000 } as MediaAssetDto;
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, "paused", { configurable: true, value: true });
      this.dispatchEvent(new Event("pause"));
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, "paused", { configurable: true, value: false });
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  function editor(writable = true, initialOutput?: MediaAssetDto, unknownDuration = false) {
    const changed = vi.fn();
    const cleared = vi.fn();
    function Harness({ result }: { result?: MediaAssetDto }) {
      const [parameters, setParameters] = useState({ startMs: 1000, endMs: 3000, stripAudio: false });
      return <NextIntlClientProvider locale="en" messages={messages}>
        <VideoTrimEditor source={unknownDuration ? { ...source, durationMs: null } : source} output={result}
          {...parameters} writable={writable}
          onClearOutput={cleared}
          onChange={(patch) => { changed(patch); setParameters((current) => ({ ...current, ...patch })); }} />
      </NextIntlClientProvider>;
    }
    const rendered = render(<Harness result={initialOutput} />);
    return { ...rendered, changed, cleared, result: (next: MediaAssetDto) => rendered.rerender(<Harness result={next} />) };
  }

  it("restores a canonical range, seeks the source, edits times and preserves it across result switching", () => {
    const { container, changed, cleared, result } = editor();
    expect(screen.getByRole("tab", { name: "Result" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Source" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "Source" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Source" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("slider", { name: "Trim start" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("slider", { name: "Trim end" })).toHaveAttribute("aria-valuenow", "3");
    const video = container.querySelector("video")!;
    fireEvent.keyDown(screen.getByRole("slider", { name: "Playback position" }), { key: "ArrowRight" });
    expect(video.currentTime).toBeCloseTo(0.1);
    expect(changed).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Trim start time" }), { target: { value: "1.2" } });
    expect(changed).toHaveBeenLastCalledWith({ startMs: 1200, endMs: 3000 });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Trim end time" }), { target: { value: "2.8" } });
    expect(changed).toHaveBeenLastCalledWith({ startMs: 1200, endMs: 2800 });
    fireEvent.click(screen.getByRole("button", { name: "Remove embedded audio" }));
    expect(changed).toHaveBeenLastCalledWith({ stripAudio: true });
    result(output);
    expect(container.querySelector('[data-preview-state="output"] video')).toHaveAttribute("src", output.url);
    expect(screen.getByRole("spinbutton", { name: "Trim start time" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Result" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Result" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Source" })).toHaveFocus();
    expect(container.querySelector('[data-preview-state="input"] video')).toHaveAttribute("src", source.url);
    expect(screen.getByRole("spinbutton", { name: "Trim start time" })).toHaveValue(1.2);
    expect(screen.getByRole("spinbutton", { name: "Trim end time" })).toHaveValue(2.8);
    expect(screen.getByRole("button", { name: "Remove embedded audio" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Result" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear result" }));
    expect(cleared).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-preview-state="input"] video')).toHaveAttribute("src", source.url);
    expect(screen.getByRole("spinbutton", { name: "Trim start time" })).toHaveValue(1.2);
  });

  it("uses decoded metadata when needed and plays only the selected source range", async () => {
    const { container } = editor(true, undefined, true);
    expect(screen.getByRole("spinbutton", { name: "Trim start time" })).toBeDisabled();
    const video = container.querySelector("video")!;
    Object.defineProperty(video, "duration", { configurable: true, value: 4 });
    fireEvent.loadedMetadata(video);
    expect(screen.getByRole("spinbutton", { name: "Trim start time" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Play selection" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled());
    expect(video.currentTime).toBe(1);
    video.currentTime = 3.1;
    fireEvent.timeUpdate(video);
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBe(3);
    fireEvent.error(video);
    expect(screen.getByRole("button", { name: "Play selection" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not play");
  });

  it("keeps inspection available in read only mode and disables edits", () => {
    const { container, changed } = editor(false);
    expect(screen.getByRole("spinbutton", { name: "Trim start time" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "Trim end time" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove embedded audio" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Playback position" })).toHaveAttribute("aria-disabled", "false");
    fireEvent.keyDown(screen.getByRole("slider", { name: "Playback position" }), { key: "End" });
    expect(container.querySelector("video")!.currentTime).toBe(4);
    expect(changed).not.toHaveBeenCalled();
  });
});
