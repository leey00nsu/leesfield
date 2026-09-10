import { AppCanvasInputProvider } from "@/shared/ui/app-canvas-input-provider";
import { act, cleanup, fireEvent, render as baseRender, screen, waitFor, within } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NodeBananaUpstreamHostProvider, useWorkflowStore, useVideoAutoplay } from "@node-banana-runtime/upstream-node-host";

const render = (ui: Parameters<typeof baseRender>[0], options?: Parameters<typeof baseRender>[1]) => baseRender(ui, {wrapper:AppCanvasInputProvider,...options});

const panelSelection = vi.hoisted(() => ({ nodes: [] as Array<Record<string, unknown>> }));
vi.mock("@xyflow/react", async (importOriginal) => ({
  ...await importOriginal<typeof import("@xyflow/react")>(),
  useNodes: () => panelSelection.nodes,
  // Standalone presenter fixtures have no React Flow node context; E2E owns connection state.
  useNodeConnections: () => [],
}));

vi.mock("react-konva", () => {
  const Primitive = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Arrow: Primitive,
    Ellipse: Primitive,
    Image: Primitive,
    Layer: Primitive,
    Line: Primitive,
    Rect: Primitive,
    Stage: Primitive,
    Text: Primitive,
    Transformer: () => null,
  };
});

import {
  AnnotationModal,
  NodeBananaUpstreamHeader,
  NodeBananaUpstreamNode,
  NodeBananaUpstreamControlPanel,
  canonicalPatchForNode,
  nodeBananaUpstreamComponentNames,
  nodeBananaUpstreamComponents,
  upstreamDataForNode,
  type NodeBananaUpstreamNodeProps,
} from "@node-banana-runtime/runtime-entry";

const upstreamKinds = Object.keys(nodeBananaUpstreamComponentNames) as Array<
  keyof typeof nodeBananaUpstreamComponentNames
>;

function identityNode(kind: string, id: string) {
  return (
    <NodeBananaUpstreamNode
      {...({
        id,
        type: "canonicalNode",
        data: { canonicalKind: kind, config: { parameters: {} } },
        selected: false,
        isConnectable: true,
        positionAbsolute: { x: 0, y: 0 },
        sourcePosition: "right",
        targetPosition: "left",
        zIndex: 0,
        dragging: false,
        draggable: true,
        selectable: true,
        deletable: true,
      } as unknown as NodeBananaUpstreamNodeProps)}
    />
  );
}

type UpstreamKind = keyof typeof nodeBananaUpstreamComponentNames;
type UpstreamHost = NonNullable<NodeBananaUpstreamNodeProps["host"]>;

type PresenterContract = {
  kind: UpstreamKind;
  data: Record<string, unknown>;
  host?: UpstreamHost;
  assertBody: (body: HTMLElement) => void;
  exercise?: (body: HTMLElement) => void;
  expectedUpdate?: { nodeId: string; patch: Record<string, unknown> };
  expectedRegenerate?: string;
};

const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAFAgI/69ZOLwAAAABJRU5ErkJggg==";
const tinyPngB =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFgAI/7h0fGQAAAABJRU5ErkJggg==";

describe("hosted operation recovery and local results", () => {
  for(const kind of ["generate.image","generate.video"] as const)it(`${kind} renders distinct contract file handles`,()=>{
    const view=renderPresenter({kind,data:{config:{modelKey:"new-workflow",prompt:"",parameters:{}},providerInputSchema:[{name:"image-field-source",type:"image",label:"Source",required:true},{name:"image-field-mask",type:"image",label:"Mask",required:true},{name:"video-field-clips",type:"video",label:"Clips",required:false}]},assertBody:()=>undefined},vi.fn(),vi.fn());
    for(const name of ["image-field-source","image-field-mask","video-field-clips"])expect(view.body.querySelector(`[data-handleid="${name}"]`)).not.toBeNull();
    view.unmount();
  });
  it("renders explicit cancellation for an active media operation, including after remount", () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const props = {
      runtimeData: { canonicalKind: "edit.image.resize", id: "resize", config: { parameters: {} } },
      position: { x: 0, y: 0 }, width: 320, selected: true, isExecuting: true, onCancelNode: cancel,
    };
    const view = render(<ReactFlowProvider><NodeBananaUpstreamHeader {...props} /></ReactFlowProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Cancel operation" }));
    expect(cancel).toHaveBeenCalledExactlyOnceWith("resize");
    view.rerender(<ReactFlowProvider><NodeBananaUpstreamHeader {...props} isExecuting={false} /></ReactFlowProvider>);
    expect(screen.queryByRole("button", { name: "Cancel operation" })).not.toBeInTheDocument();
    view.rerender(<ReactFlowProvider><NodeBananaUpstreamHeader {...props} host={{ writable: false }} /></ReactFlowProvider>);
    expect(screen.getByRole("button", { name: "Cancel operation" })).toBeDisabled();
    view.unmount();
  });

  it("shows the ordered saved Split Grid cells instead of claiming node-group materialization", () => {
    const view = renderPresenter({
      kind: "edit.image.splitGrid",
      data: { outputImages: [tinyPng, tinyPngB], disableSplitGridTemplateEditor: true },
      assertBody: () => undefined,
    }, vi.fn(), vi.fn());
    expect(within(view.body).getByAltText("Split cell 1")).toHaveAttribute("src", tinyPng);
    expect(within(view.body).getByAltText("Split cell 2")).toHaveAttribute("src", tinyPngB);
    expect(within(view.body).getByText("2 saved images — Images output → Gallery / GIF")).toBeInTheDocument();
    expect(within(view.body).queryByText("Split creates a group per cell")).not.toBeInTheDocument();
    view.unmount();
  });
});

function renderPresenter(
  contract: PresenterContract,
  onUpdateNodeData: ReturnType<typeof vi.fn>,
  onRegenerateNode: ReturnType<typeof vi.fn>,
) {
  const nodeId = `node-${contract.kind}`;
  const { container, unmount } = render(
    <ReactFlowProvider>
      <NodeBananaUpstreamNode
        {...({
          id: nodeId,
          type: "canonicalNode",
          data: {
            canonicalKind: contract.kind,
            config: { parameters: {} },
            ...contract.data,
          },
          selected: true,
          isConnectable: true,
          positionAbsolute: { x: 0, y: 0 },
          sourcePosition: "right",
          targetPosition: "left",
          zIndex: 0,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          host: { inlineParametersEnabled: true, ...contract.host },
          onUpdateNodeData,
          onRegenerateNode,
        } as unknown as NodeBananaUpstreamNodeProps)}
      />
    </ReactFlowProvider>,
  );

  const body = container.querySelector<HTMLElement>(
    `[data-node-banana-component="${nodeBananaUpstreamComponentNames[contract.kind]}"]`,
  );
  expect(body, `${contract.kind} should render its actual upstream body`).not.toBeNull();
  return { body: body as HTMLElement, container, unmount };
}

const upstreamPresenterContracts: readonly PresenterContract[] = [
  {
    kind: "input.image",
    data: {
      image: tinyPng,
      filename: "input.png",
      config: { assetId: "asset-image", parameters: {} },
    },
    assertBody: (body) => {
      expect(within(body).getByRole("img", { name: "input.png" })).toBeVisible();
      expect(within(body).getByRole("button", { name: "Remove image" })).toBeEnabled();
    },
    exercise: (body) => fireEvent.click(within(body).getByRole("button", { name: "Remove image" })),
    expectedUpdate: { nodeId: "node-input.image", patch: { config: { assetId: null } } },
  },
  {
    kind: "input.audio",
    data: { config: { assetId: null, parameters: {} } },
    assertBody: (body) => {
      expect(within(body).getByRole("button", { name: "Upload audio file" })).toBeEnabled();
    },
    exercise: (body) => fireEvent.keyDown(within(body).getByRole("button", { name: "Upload audio file" }), { key: "Enter" }),
  },
  {
    kind: "input.video",
    data: { config: { assetId: null, parameters: {} } },
    assertBody: (body) => {
      expect(within(body).getByRole("button", { name: "Upload video file" })).toBeEnabled();
      expect(within(body).getByRole("button", { name: "Upload video file" })).toHaveAttribute("tabindex", "0");
    },
    exercise: (body) => fireEvent.click(within(body).getByRole("button", { name: "Upload video file" })),
  },
  {
    kind: "input.prompt",
    data: { config: { text: "", parameters: {} } },
    assertBody: (body) => {
      expect(within(body).getByPlaceholderText("Describe what to generate...")).toBeVisible();
      expect(within(body).getByRole("button", { name: "Add variable" })).toBeEnabled();
    },
    exercise: (body) => {
      const prompt = within(body).getByPlaceholderText("Describe what to generate...");
      fireEvent.change(prompt, { target: { value: "A hosted prompt" } });
      fireEvent.blur(prompt);
    },
    expectedUpdate: { nodeId: "node-input.prompt", patch: { config: { text: "A hosted prompt" } } },
  },
  {
    kind: "process.promptConstructor",
    data: { config: { template: "" } },
    assertBody: (body) => expect(within(body).getByRole("textbox")).toBeVisible(),
    exercise: (body) => {
      const textbox = within(body).getByRole("textbox");
      fireEvent.change(textbox, { target: { value: "A @subject portrait" } });
      fireEvent.blur(textbox);
    },
    expectedUpdate: { nodeId: "node-process.promptConstructor", patch: { config: { template: "A @subject portrait" } } },
  },
  {
    kind: "generate.image",
    data: {
      config: { prompt: "", modelKey: "nano-banana-pro", parameters: {} },
      model: "nano-banana-pro",
      outputImage: tinyPng,
    },
    assertBody: (body) => {
      expect(within(body).getByRole("img", { name: "Generated" })).toBeVisible();
      expect(within(body).getByTitle("Clear image")).toBeEnabled();
    },
    exercise: (body) => fireEvent.click(within(body).getByTitle("Clear image")),
    expectedUpdate: {
      nodeId: "node-generate.image",
      patch: { config: { modelKey: "nano-banana-pro" }, selectedOutputAssetId: null },
    },
  },
  {
    kind: "generate.audio",
    data: {
      config: { prompt: "", modelKey: "audio-model", parameters: {} },
      outputAudio: "https://read.example/audio.mp3",
    },
    assertBody: (body) => {
      expect(within(body).getByTitle("Play")).toBeEnabled();
      expect(within(body).getByText("Processing...")).toBeVisible();
    },
    exercise: (body) => fireEvent.click(within(body).getByTitle("Clear audio")),
    expectedUpdate: {
      nodeId: "node-generate.audio",
      patch: { config: { modelKey: "audio-model" }, selectedOutputAssetId: null },
    },
  },
  {
    kind: "generate.video",
    data: {
      config: { prompt: "", modelKey: "video-model", parameters: {} },
      outputVideo: "https://read.example/video.mp4",
    },
    assertBody: (body) => {
      expect(body.querySelector("video[controls]")).not.toBeNull();
      expect(within(body).getByTitle("Clear video")).toBeEnabled();
    },
    exercise: (body) => fireEvent.click(within(body).getByTitle("Clear video")),
    expectedUpdate: {
      nodeId: "node-generate.video",
      patch: { config: { modelKey: "video-model" }, selectedOutputAssetId: null },
    },
  },
  {
    kind: "edit.image.annotation",
    data: {
      config: { parameters: { shapes: [] } },
      sourceImage: tinyPng,
    },
    assertBody: (body) => {
      expect(within(body).getByRole("img", { name: "Annotated" })).toBeVisible();
      expect(within(body).getByText("Add annotations")).toBeVisible();
    },
    exercise: (body) => {
      fireEvent.click(within(body).getByText("Add annotations"));
      expect(screen.getByRole("dialog", { name: "Annotation editor" })).toBeVisible();
    },
  },
  {
    kind: "edit.image.resize",
    data: {
      config: { parameters: { mode: "exact", width: 640, height: 480, fit: "contain", format: "keep", quality: 0.8 } },
    },
    assertBody: (body) => {
      expect(within(body).getByRole("button", { name: "Max Edge" })).toBeEnabled();
      expect(within(body).getByRole("button", { name: "Resize" })).toBeDisabled();
    },
    exercise: (body) => fireEvent.click(within(body).getByRole("button", { name: "Max Edge" })),
    expectedUpdate: { nodeId: "node-edit.image.resize", patch: { config: { parameters: { mode: "maxEdge" } } } },
  },
  {
    kind: "edit.image.removeBackground",
    data: { config: { parameters: { model: "isnet_fp16" } } },
    assertBody: (body) => {
      expect(within(body).getByRole("button", { name: "Fast" })).toBeEnabled();
      expect(within(body).getByRole("button", { name: "Quality" })).toBeEnabled();
      expect(within(body).getByText("Connect an image input")).toBeVisible();
    },
    exercise: (body) => fireEvent.click(within(body).getByRole("button", { name: "Quality" })),
    expectedUpdate: { nodeId: "node-edit.image.removeBackground", patch: { config: { parameters: { model: "isnet" } } } },
  },
  {
    kind: "edit.image.splitGrid",
    data: {
      config: { parameters: { rows: 2, cols: 2, rowOffsets: [], colOffsets: [] } },
      disableSplitGridTemplateEditor: true,
      sourceImage: tinyPng,
    },
    assertBody: (body) => {
      expect(within(body).getByRole("textbox", { name: "Rows" })).toHaveValue("2");
      expect(within(body).queryByRole("button", { name: /Cell nodes/ })).toBeNull();
      const grid = body.querySelector<HTMLElement>("[style*='grid-template-columns']");
      expect(grid).not.toBeNull();
      expect(grid?.style.gridTemplateColumns).toBe("0.5fr 0.5fr");
      expect(grid?.style.gridTemplateRows).toBe("0.5fr 0.5fr");
    },
    exercise: (body) => fireEvent.click(within(body).getByRole("button", { name: "Increase rows" })),
    expectedUpdate: { nodeId: "node-edit.image.splitGrid", patch: { config: { parameters: { rows: 3 } } } },
  },
  {
    kind: "edit.image.gif",
    data: { config: { parameters: { fps: 8, colorCount: 128, dither: false, targetMaxBytes: null, clipOrder: [] } } },
    host: {
      nodes: [
        { id: "gif-frame-1", type: "imageInput", data: { canonicalKind: "input.image", image: tinyPng, config: { assetId: null } } },
        { id: "gif-frame-2", type: "imageInput", data: { canonicalKind: "input.image", image: tinyPngB, config: { assetId: null } } },
      ],
      edges: [
        { id: "gif-edge-1", source: "gif-frame-1", target: "node-edit.image.gif", targetHandle: "image-0" },
        { id: "gif-edge-2", source: "gif-frame-2", target: "node-edit.image.gif", targetHandle: "image-1" },
      ],
    },
    assertBody: (body) => {
      expect(body.querySelector('[data-frame-id="gif-edge-1"]')).not.toBeNull();
      expect(body.querySelector('[data-frame-id="gif-edge-2"]')).not.toBeNull();
      expect(within(body).getByRole("button", { name: "Encode GIF" })).toBeEnabled();
    },
    exercise: (body) => fireEvent.click(within(body).getByRole("button", { name: "Encode GIF" })),
    expectedRegenerate: "node-edit.image.gif",
  },
  {
    kind: "edit.video.stitch",
    data: { config: { parameters: { repeat: 1, stripAudio: false, clipOrder: [] } }, encoderSupported: true },
    host: {
      nodes: [
        { id: "stitch-clip-1", type: "generateVideo", data: { canonicalKind: "generate.video", outputVideo: null, config: { parameters: {} } } },
        { id: "stitch-clip-2", type: "generateVideo", data: { canonicalKind: "generate.video", outputVideo: null, config: { parameters: {} } } },
      ],
      edges: [
        { id: "stitch-edge-1", source: "stitch-clip-1", target: "node-edit.video.stitch", targetHandle: "video-0" },
        { id: "stitch-edge-2", source: "stitch-clip-2", target: "node-edit.video.stitch", targetHandle: "video-1" },
      ],
    },
    assertBody: (body) => {
      expect(body.querySelector('[data-clip-id="stitch-edge-1"]')).not.toBeNull();
      expect(body.querySelector('[data-clip-id="stitch-edge-2"]')).not.toBeNull();
      expect(within(body).getByRole("switch", { name: "Strip audio" })).not.toBeChecked();
      expect(within(body).getByRole("button", { name: "Stitch" })).toBeEnabled();
    },
    exercise: (body) => fireEvent.click(within(body).getByRole("button", { name: "2x" })),
    expectedUpdate: { nodeId: "node-edit.video.stitch", patch: { config: { parameters: { repeat: 2 } } } },
  },
  {
    kind: "edit.video.trim",
    data: {
      config: { parameters: { startMs: 1_000, endMs: 5_000, stripAudio: false } },
      duration: 8,
      encoderSupported: true,
    },
    host: {
      nodes: [
        { id: "trim-source", type: "generateVideo", data: { canonicalKind: "generate.video", outputVideo: "https://read.example/source.mp4", config: { parameters: {} } } },
      ],
      edges: [
        { id: "trim-edge", source: "trim-source", target: "node-edit.video.trim", targetHandle: "video" },
      ],
    },
    assertBody: (body) => {
      expect(within(body).getAllByRole("slider")).toHaveLength(2);
      expect(within(body).getByText("Duration")).toBeVisible();
      expect(within(body).getByRole("switch", { name: "Strip audio" })).not.toBeChecked();
      expect(within(body).getByRole("button", { name: "Trim" })).toBeEnabled();
    },
    exercise: (body) => {
      const [start] = within(body).getAllByRole("slider");
      fireEvent.change(start, { target: { value: "2" } });
    },
    expectedUpdate: { nodeId: "node-edit.video.trim", patch: { config: { parameters: { startMs: 2_000, endMs: 5000 } } } },
  },
  {
    kind: "edit.video.frameGrab",
    data: { config: { parameters: { position: "first" } } },
    assertBody: (body) => {
      expect(within(body).getByRole("button", { name: "First" })).toBeEnabled();
      expect(within(body).getByRole("button", { name: "Extract Frame" })).toBeDisabled();
    },
    exercise: (body) => fireEvent.click(within(body).getByRole("button", { name: "Last" })),
    expectedUpdate: { nodeId: "node-edit.video.frameGrab", patch: { config: { parameters: { position: "last" } } } },
  },
  {
    kind: "edit.video.easeCurve",
    data: { config: { parameters: { outputDurationMs: 1_500, easingPreset: "easeInOutSine", bezier: [0.42, 0, 0.58, 1] } }, encoderSupported: true, sourceVideo: "https://read.example/source.mp4", outputVideo: "https://read.example/eased.mp4" },
    assertBody: (body) => {
      expect(body.querySelector("video[controls]")).not.toBeNull();
      expect(within(body).getByTitle("Clear video")).toBeEnabled();
      expect(within(body).getByRole("spinbutton", { name: "Output duration" })).toHaveValue(1.5);
      expect(within(body).getByRole("combobox", { name: "Easing preset" })).toHaveTextContent("easeInOutSine");
      expect(within(body).getByRole("button", { name: "Run" })).toBeEnabled();
    },
    exercise: (body) => {
      fireEvent.click(within(body).getByRole("button", { name: "Run" }));
      fireEvent.click(within(body).getByTitle("Clear video"));
    },
    expectedUpdate: { nodeId: "node-edit.video.easeCurve", patch: { config: { parameters: { outputDurationMs: 1_500 } } } },
    expectedRegenerate: "node-edit.video.easeCurve",
  },
  {
    kind: "output.single",
    data: { config: { mediaType: "image" }, image: tinyPng },
    assertBody: (body) => {
      expect(within(body).getByRole("img", { name: "Output" })).toBeVisible();
      expect(within(body).getByTitle("Download")).toBeEnabled();
    },
    exercise: (body) => {
      fireEvent.click(within(body).getByRole("img", { name: "Output" }));
      expect(screen.getByRole("img", { name: "Output full size" })).toBeVisible();
    },
  },
  {
    kind: "output.gallery",
    data: {
      config: { mediaType: "image" },
      images: [tinyPng, tinyPngB],
      imageRefs: ["gallery-image-1", "gallery-image-2"],
    },
    assertBody: (body) => {
      expect(within(body).getByText("2 items")).toBeVisible();
      expect(within(body).getByRole("button", { name: "Extract" })).toBeEnabled();
      expect(within(body).getByRole("button", { name: "Open image 1" })).toBeEnabled();
    },
    exercise: (body) => {
      fireEvent.click(within(body).getByRole("button", { name: "Open image 1" }));
      expect(screen.getByRole("img", { name: "Gallery image 1" })).toBeVisible();
    },
  },
  {
    kind: "inspect.imageCompare",
    data: { config: { parameters: {} }, imageA: tinyPng, imageB: tinyPngB },
    assertBody: (body) => {
      expect(within(body).getByRole("img", { name: "Image A" })).toBeVisible();
      expect(within(body).getByRole("img", { name: "Image B" })).toBeVisible();
    },
  },
];

describe("Node Banana v1.9.0 hosted component bridge", () => {
  it("preserves a user's pause across selection, hover and loadeddata until manual play", () => {
    vi.useFakeTimers();
    function Player({ selected }: { selected: boolean }) {
      const ref = useVideoAutoplay("paused-video", selected);
      const setHovered = useWorkflowStore(state => state.setHoveredNodeId);
      return <div data-testid="paused-player" onMouseEnter={() => setHovered("paused-video")} onMouseLeave={() => setHovered(null)}><video ref={ref} controls /></div>;
    }
    const view = (selected: boolean) => <NodeBananaUpstreamHostProvider><Player selected={selected} /></NodeBananaUpstreamHostProvider>;
    const { container, rerender, unmount } = render(view(true));
    const video = container.querySelector("video")!;
    Object.defineProperty(video, "readyState", { configurable: true, value: 4 });
    try {
      const plays = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
      fireEvent.pause(video);
      fireEvent.mouseEnter(screen.getByTestId("paused-player"));
      rerender(view(false));
      fireEvent.loadedData(video);
      act(() => vi.advanceTimersByTime(500));
      rerender(view(true));
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(plays);
      fireEvent.play(video);
      fireEvent.loadedData(video);
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(plays + 1);
    } finally { unmount(); vi.useRealTimers(); vi.mocked(HTMLMediaElement.prototype.play).mockClear(); }
  });

  it("plays conditional video mounts on hover and pauses on leave", () => {
    vi.useFakeTimers();
    function Player({ visible }: { visible: boolean }) {
      const ref = useVideoAutoplay("video", false);
      const setHovered = useWorkflowStore((state) => state.setHoveredNodeId);
      return <div data-testid="hover-player" onMouseEnter={() => setHovered("video")} onMouseLeave={() => setHovered(null)}>
        {visible && <video ref={ref} />}
      </div>;
    }
    const view = (visible: boolean) => <NodeBananaUpstreamHostProvider><Player visible={visible} /></NodeBananaUpstreamHostProvider>;
    const { rerender, container, unmount } = render(view(false));
    try {
      fireEvent.mouseEnter(screen.getByTestId("hover-player"));
      rerender(view(true));
      act(() => vi.advanceTimersByTime(300));
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
      fireEvent.loadedData(container.querySelector("video")!);
      act(() => vi.advanceTimersByTime(300));
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
      fireEvent.mouseLeave(screen.getByTestId("hover-player"));
      expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
      fireEvent.mouseEnter(screen.getByTestId("hover-player"));
      unmount();
      act(() => vi.advanceTimersByTime(300));
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it("shares transient hover across nested node providers without persisting it", () => {
    const update = vi.fn();
    function Probe({ name }: { name: string }) {
      const hovered = useWorkflowStore((state) => state.hoveredNodeId);
      const setHovered = useWorkflowStore((state) => state.setHoveredNodeId);
      return <button onMouseEnter={() => setHovered(name)} onMouseLeave={() => setHovered(null)}>{name}:{hovered ?? "none"}</button>;
    }
    render(<NodeBananaUpstreamHostProvider value={{ onUpdateNodeData: update }}>
      <NodeBananaUpstreamHostProvider><Probe name="video" /></NodeBananaUpstreamHostProvider>
      <NodeBananaUpstreamHostProvider><Probe name="output" /></NodeBananaUpstreamHostProvider>
    </NodeBananaUpstreamHostProvider>);
    fireEvent.mouseEnter(screen.getByText("video:none"));
    expect(screen.getByText("video:video")).toBeInTheDocument();
    expect(screen.getByText("output:video")).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByText("video:video"));
    expect(screen.getByText("output:none")).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [] }),
      blob: async () => new Blob(),
    }));
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  it.each(upstreamKinds)("exports the actual %s presenter", (kind) => {
    const component = nodeBananaUpstreamComponents[kind];
    const expectedName = nodeBananaUpstreamComponentNames[kind];

    expect(component).toBeTypeOf("function");
    expect(component.name).toBe(expectedName);
  });

  it("covers exactly the 20 upstream-backed canonical kinds with distinct body contracts", () => {
    const expectedKinds = [
      "input.image",
      "input.audio",
      "input.video",
      "input.prompt",
      "process.promptConstructor",
      "generate.image",
      "generate.audio",
      "generate.video",
      "edit.image.annotation",
      "edit.image.resize",
      "edit.image.removeBackground",
      "edit.image.splitGrid",
      "edit.image.gif",
      "edit.video.stitch",
      "edit.video.trim",
      "edit.video.frameGrab",
      "edit.video.easeCurve",
      "output.single",
      "output.gallery",
      "inspect.imageCompare",
    ] as const;

    expect(upstreamKinds).toEqual(expectedKinds);
    expect(upstreamPresenterContracts.map((contract) => contract.kind)).toEqual(expectedKinds);
    expect(upstreamPresenterContracts.map((contract) => contract.kind)).not.toContain("edit.audio.basic");

    for (const contract of upstreamPresenterContracts) {
      const onUpdateNodeData = vi.fn();
      const onRegenerateNode = vi.fn();
      const view = renderPresenter(contract, onUpdateNodeData, onRegenerateNode);

      contract.assertBody(view.body);
      contract.exercise?.(view.body);

      const expectedUpdate = contract.expectedUpdate;
      if (expectedUpdate) {
        const matchingCall = onUpdateNodeData.mock.calls.find(
          ([nodeId, patch]) => {
            if (nodeId !== expectedUpdate.nodeId) return false;
            try {
              expect(patch).toMatchObject(expectedUpdate.patch);
              return true;
            } catch {
              return false;
            }
          },
        );
        expect(matchingCall, `${contract.kind} should update its canonical host data`).toBeDefined();
      }
      if (contract.expectedRegenerate) {
        expect(onRegenerateNode).toHaveBeenCalledWith(contract.expectedRegenerate);
      }

      view.unmount();
    }
  });

  it("does not render NaN while Audio Input metadata is unresolved", async () => {
    class MetadataPendingAudio {
      currentTime = 0;
      duration = Number.NaN;
      paused = true;
      preload = "";
      addEventListener() {}
      removeEventListener() {}
      pause() {}
      load() {}
      play() { return Promise.resolve(); }
    }
    vi.stubGlobal("Audio", MetadataPendingAudio);

    const { body } = renderPresenter({
      kind: "input.audio",
      data: {
        audioFile: "data:audio/wav;base64,UklGRg==",
        config: { assetId: "audio-pending", parameters: {} },
      },
      assertBody: () => undefined,
    }, vi.fn(), vi.fn());

    await waitFor(() => expect(body.textContent).not.toContain("NaN"));
    expect(body.querySelector(".flex-1.h-1.bg-neutral-700")?.textContent).toBe("");
  });

  it("persists VideoStitch strip-audio changes through the canonical host adapter", () => {
    const onUpdateNodeData = vi.fn();
    const view = renderPresenter({
      kind: "edit.video.stitch",
      data: {
        config: { parameters: { repeat: 1, stripAudio: false, clipOrder: [] } },
        encoderSupported: true,
      },
      host: {
        nodes: [
          { id: "stitch-source-1", type: "generateVideo", data: { canonicalKind: "generate.video", outputVideo: "https://read.example/one.mp4", config: { parameters: {} } } },
          { id: "stitch-source-2", type: "generateVideo", data: { canonicalKind: "generate.video", outputVideo: "https://read.example/two.mp4", config: { parameters: {} } } },
        ],
        edges: [
          { id: "stitch-remove-1", source: "stitch-source-1", target: "node-edit.video.stitch", targetHandle: "video-0" },
          { id: "stitch-remove-2", source: "stitch-source-2", target: "node-edit.video.stitch", targetHandle: "video-1" },
        ],
      },
      assertBody: () => undefined,
    }, onUpdateNodeData, vi.fn());

    fireEvent.click(within(view.body).getByRole("switch", { name: "Strip audio" }));
    expect(onUpdateNodeData).toHaveBeenCalledWith(
      "node-edit.video.stitch",
      expect.objectContaining({ config: expect.objectContaining({ parameters: expect.objectContaining({ stripAudio: true }) }) }),
    );
    view.unmount();
  });

  it("persists VideoTrim strip-audio changes through the canonical host adapter", () => {
    const onUpdateNodeData = vi.fn();
    const view = renderPresenter({
      kind: "edit.video.trim",
      data: {
        config: { parameters: { startMs: 1_000, endMs: 5_000, stripAudio: false } },
        duration: 8,
        encoderSupported: true,
      },
      host: {
        nodes: [{ id: "trim-strip-source", type: "generateVideo", data: { canonicalKind: "generate.video", outputVideo: "https://read.example/source.mp4", config: { parameters: {} } } }],
        edges: [{ id: "trim-strip-edge", source: "trim-strip-source", target: "node-edit.video.trim", targetHandle: "video" }],
      },
      assertBody: () => undefined,
    }, onUpdateNodeData, vi.fn());

    fireEvent.click(within(view.body).getByRole("switch", { name: "Strip audio" }));
    expect(onUpdateNodeData).toHaveBeenCalledWith(
      "node-edit.video.trim",
      expect.objectContaining({ config: expect.objectContaining({ parameters: expect.objectContaining({ stripAudio: true }) }) }),
    );
    view.unmount();
  });

  it("extracts a Stitch thumbnail from the actual Video Input type", () => {
    const source = "https://read.example/uploaded.mp4";
    const setSource = vi.spyOn(HTMLMediaElement.prototype, "src", "set");
    try {
      const view = renderPresenter({
        kind: "edit.video.stitch",
        data: { config: { parameters: { clipOrder: ["input-edge"] } }, encoderSupported: true },
        host: {
          nodes: [{ id: "input", type: "videoInput", data: { canonicalKind: "input.video", video: source, config: {} } }],
          edges: [{ id: "input-edge", source: "input", target: "node-edit.video.stitch", targetHandle: "video-0" }],
        },
        assertBody: () => undefined,
      }, vi.fn(), vi.fn());
      expect(setSource).toHaveBeenCalledWith(source);
      view.unmount();
    } finally {
      setSource.mockRestore();
    }
  });

  it("preserves mixed GIF frame provenance and reorders entire source groups", () => {
    const removeEdge = vi.fn();
    const update = vi.fn();
    const frameGroups = [
      { sourceEdgeId: "edge-A", frames: [tinyPng, tinyPngB] },
      { sourceEdgeId: "edge-B", frames: ["https://read.example/single.png"] },
    ];
    const host: UpstreamHost = {
      nodes: [],
      edges: [
        { id: "edge-A", source: "split", target: "node-edit.image.gif", targetHandle: "image-0" },
        { id: "edge-B", source: "single", target: "node-edit.image.gif", targetHandle: "image-1" },
      ],
      removeEdge,
    };
    const renderFrames = (clipOrder: string[], connectedHost = host) => renderPresenter({
      kind: "edit.image.gif",
      data: { config: { parameters: { clipOrder } }, frames: frameGroups.flatMap((g) => g.frames), frameGroups },
      host: connectedHost,
      assertBody: () => undefined,
    }, update, vi.fn());
    const view = renderFrames(["edge-A", "edge-B"]);
    const tiles = Array.from(view.body.querySelectorAll<HTMLElement>("[data-frame-id]"));
    expect(tiles.map((tile) => tile.dataset.sourceEdgeId)).toEqual(["edge-A", "edge-A", "edge-B"]);
    for (const tile of tiles) expect(within(tile).getByRole("img")).toHaveAttribute("draggable", "false");
    fireEvent.click(within(tiles[2]).getByTitle("Disconnect"));
    expect(removeEdge).toHaveBeenCalledExactlyOnceWith("edge-B");
    Object.defineProperty(tiles[2], "setPointerCapture", { value: vi.fn() });
    Object.defineProperty(tiles[2], "releasePointerCapture", { value: vi.fn() });
    const oldElementsFromPoint = document.elementsFromPoint;
    const oldPointerEvent = window.PointerEvent;
    Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: () => [tiles[1]] });
    window.PointerEvent = MouseEvent as typeof PointerEvent;
    try {
      fireEvent.pointerDown(tiles[2], { button: 0, pointerId: 1 });
      fireEvent.pointerMove(tiles[2], { pointerId: 1, clientX: 10, clientY: 10 });
      fireEvent.pointerUp(tiles[2], { pointerId: 1 });
      expect(update).toHaveBeenLastCalledWith("node-edit.image.gif", expect.objectContaining({
        config: expect.objectContaining({ parameters: expect.objectContaining({ clipOrder: ["edge-B", "edge-A"] }) }),
      }));
    } finally {
      window.PointerEvent = oldPointerEvent;
      Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: oldElementsFromPoint });
      view.unmount();
    }
    const reordered = renderFrames(["edge-B", "edge-A"]);
    expect(Array.from(reordered.body.querySelectorAll("[data-frame-id] img")).map((img) => img.getAttribute("src")))
      .toEqual([frameGroups[1].frames[0], tinyPng, tinyPngB]);
    reordered.unmount();
    const disconnected = renderFrames(["edge-A"], { ...host, edges: host.edges?.slice(0, 1) });
    expect(Array.from(disconnected.body.querySelectorAll<HTMLElement>("[data-frame-id]")).map((tile) => tile.dataset.sourceEdgeId))
      .toEqual(["edge-A", "edge-A"]);
    disconnected.unmount();
  });

  it.each([
    ["edit.image.gif", "gif-disconnect-edge", "image-0"],
    ["edit.video.stitch", "stitch-disconnect-edge", "video-0"],
  ] as const)("routes %s Disconnect through the durable host callback", (kind, edgeId, targetHandle) => {
    const removeEdge = vi.fn();
    const hostNodeType = kind === "edit.image.gif" ? "imageInput" : "generateVideo";
    const sourceData = kind === "edit.image.gif"
      ? { canonicalKind: "input.image", image: tinyPng, config: { assetId: null } }
      : { canonicalKind: "generate.video", outputVideo: "https://read.example/clip.mp4", config: { parameters: {} } };
    const view = renderPresenter({
      kind,
      data: {
        config: { parameters: { clipOrder: [] } },
        encoderSupported: true,
      },
      host: {
        nodes: [{ id: `${kind}-disconnect-source`, type: hostNodeType, data: sourceData }],
        edges: [{ id: edgeId, source: `${kind}-disconnect-source`, target: `node-${kind}`, targetHandle }],
        removeEdge,
      },
      assertBody: () => undefined,
    }, vi.fn(), vi.fn());

    fireEvent.click(within(view.body).getByTitle("Disconnect"));
    expect(removeEdge).toHaveBeenCalledWith(edgeId);
    view.unmount();
  });

  it.each(["generate.image", "generate.audio", "generate.video"] as const)(
    "disables the internal prompt for %s when a Prompt node supplies the value",
    (kind) => {
      const view = renderPresenter({
        kind,
        data: {
          config: { prompt: "local prompt", modelKey: "model-1", parameters: {} },
          internalPrompt: "local prompt",
          prompt: "connected prompt",
          promptConnected: true,
          selectedModel: { provider: kind === "generate.image" ? "gemini" : "fal", modelId: "model-1", displayName: "Model 1" },
        },
        assertBody: () => undefined,
      }, vi.fn(), vi.fn());

      expect(within(view.body).getByRole("textbox", { name: "Prompt" })).toBeDisabled();
      expect(within(view.body).getByRole("textbox", { name: "Prompt" })).toHaveValue("connected prompt");
      expect(within(view.body).getByText("Controlled by connected Prompt node")).toBeVisible();
      view.unmount();
    },
  );

  it.each([
    ["generate.image", "outputImage"],
    ["generate.video", "outputVideo"],
    ["generate.audio", "outputAudio"],
    ["edit.image.gif", "outputGif"],
    ["edit.video.stitch", "outputVideo"],
    ["edit.video.trim", "outputVideo"],
    ["edit.video.easeCurve", "outputVideo"],
  ] as const)("maps %s output clear to the canonical selected-output field", (canonicalKind, outputField) => {
    expect(canonicalPatchForNode(
      { canonicalKind, config: { parameters: {} } },
      { [outputField]: null },
    )).toMatchObject({ selectedOutputAssetId: null });
  });

  it("resets stale SplitGrid offsets when either dimension changes", () => {
    const onUpdateNodeData = vi.fn();
    const view = renderPresenter({
      kind: "edit.image.splitGrid",
      data: {
        config: { parameters: { rows: 2, cols: 2, rowOffsets: [0.25], colOffsets: [0.75] } },
        disableSplitGridTemplateEditor: true,
      },
      assertBody: () => undefined,
    }, onUpdateNodeData, vi.fn());

    fireEvent.click(within(view.body).getByRole("button", { name: "Increase rows" }));
    fireEvent.click(within(view.body).getByRole("button", { name: "Increase columns" }));
    expect(onUpdateNodeData).toHaveBeenCalledWith(
      "node-edit.image.splitGrid",
      expect.objectContaining({ config: expect.objectContaining({ parameters: expect.objectContaining({ rows: 3, rowOffsets: [] }) }) }),
    );
    expect(onUpdateNodeData).toHaveBeenCalledWith(
      "node-edit.image.splitGrid",
      expect.objectContaining({ config: expect.objectContaining({ parameters: expect.objectContaining({ cols: 3, colOffsets: [] }) }) }),
    );
    view.unmount();
  });

  it("retains the actual upstream BaseNode DOM and layout classes", () => {
    const { container } = render(
      <ReactFlowProvider>
        {identityNode("input.image", "image-input-identity")}
      </ReactFlowProvider>,
    );

    const body = container.querySelector('[data-canonical-kind="input.image"] [class*="bg-neutral-800"]');
    const hostedWrapper = container.querySelector('[data-canonical-kind="input.image"]');
    expect(hostedWrapper?.className).toContain("h-full");
    expect(hostedWrapper?.className).toContain("w-full");
    expect(body).not.toBeNull();
    expect(body?.className).toContain("rounded-lg");
    expect(body?.className).toContain("border");
    expect(body?.querySelector('[role="button"][aria-label="Choose image"]')).not.toBeNull();
    expect(body?.querySelector(".react-flow__handle")).not.toBeNull();
    cleanup();
  });

  it("opens upload and asset choices from the image input body", () => {
    const selectAsset = vi.fn();
    render(<ReactFlowProvider><NodeBananaUpstreamHostProvider value={{
      renderInputHistory: (nodeId) => <button onClick={() => selectAsset(nodeId)}>Assets</button>,
    }}>{identityNode("input.image", "direct-image")}</NodeBananaUpstreamHostProvider></ReactFlowProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Choose image" }));
    expect(screen.getByRole("button", { name: "Upload" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Assets" }));
    expect(selectAsset).toHaveBeenCalledWith("direct-image");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Assets" })).not.toBeInTheDocument();
    cleanup();
  });

  it("renders the actual upstream floating header controls and bridges callbacks", () => {
    const onRegenerateNode = vi.fn();
    const onExpandNode = vi.fn();

    const { container } = render(
      <ReactFlowProvider>
        <NodeBananaUpstreamHeader
          runtimeData={{ canonicalKind: "generate.image", id: "generate-identity", config: { parameters: {} } }}
          position={{ x: 24, y: 60 }}
          width={300}
          selected
          onRegenerateNode={onRegenerateNode}
          onExpandNode={onExpandNode}
        />
        <NodeBananaUpstreamHeader
          runtimeData={{ canonicalKind: "input.prompt", id: "prompt-identity", config: { parameters: {} } }}
          position={{ x: 24, y: 60 }}
          width={300}
          selected
          onExpandNode={onExpandNode}
        />
      </ReactFlowProvider>,
    );

    const overlay = container.querySelector(".absolute.pointer-events-none") as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.style.left).toBe("24px");
    expect(overlay?.style.top).toBe("34px");
    expect(overlay?.style.width).toBe("300px");
    expect(screen.getAllByTitle("Run this node")).toHaveLength(1);
    expect(screen.getAllByTitle("Expand editor")).toHaveLength(1);

    fireEvent.click(screen.getByTitle("Run this node"));
    expect(onRegenerateNode).toHaveBeenCalledWith("generate-identity");
    fireEvent.click(screen.getByTitle("Expand editor"));
    expect(screen.getByRole("dialog", { name: "Edit Prompt" })).toBeInTheDocument();
    expect(onExpandNode).not.toHaveBeenCalledWith("prompt-identity", "prompt");
    cleanup();
  });

  it("shows connected text in the disabled expanded prompt without changing authored text", () => {
    const update = vi.fn();
    const runtimeData = { canonicalKind: "input.prompt", id: "expanded", config: { text: "Authored local text" } };
    const host: UpstreamHost = {
      writable: true,
      edges: [{ id: "text-edge", source: "source", target: "expanded", sourceHandle: "text", targetHandle: "text", data: {} }],
      getConnectedInputs: () => ({ text: "Connected text", images: [], videos: [], audios: [] }),
    };
    const header = (nextHost: UpstreamHost) => <ReactFlowProvider><NodeBananaUpstreamHeader runtimeData={runtimeData} position={{ x: 0, y: 30 }} width={300} selected host={nextHost} onUpdateNodeData={update} /></ReactFlowProvider>;
    const view = render(header(host));
    fireEvent.click(screen.getByTitle("Expand editor"));
    const text = screen.getByRole("textbox", { name: "Prompt text" });
    expect(text).toHaveValue("Connected text");
    expect(text).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    fireEvent.change(text, { target: { value: "Attempted overwrite" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(update).not.toHaveBeenCalled();
    expect(runtimeData.config.text).toBe("Authored local text");
    view.rerender(header({ ...host, edges: [{ ...host.edges![0], data: { hasPause: true } }] }));
    expect(text).toHaveValue("Authored local text");
    expect(text).not.toBeDisabled();
    view.rerender(header({ ...host, edges: [], writable: false }));
    expect(text).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Edit Prompt" })).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });


  it("keeps the canvas font menu inside the editor focus boundary and dismisses only the menu", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    render(<ReactFlowProvider>
      <NodeBananaUpstreamHeader runtimeData={{canonicalKind:"input.prompt", id:"font-menu", config:{text:"Prompt"}}} position={{x:0,y:30}} width={300} selected onUpdateNodeData={vi.fn()} />
    </ReactFlowProvider>);
    await user.click(screen.getByTitle("Expand editor"));
    await user.click(screen.getByRole("combobox", {name:"Prompt font size"}));
    const list = await screen.findByRole("listbox");
    expect(list.closest("[data-canvas-dialog-content]")).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", {name:"Edit Prompt"})).toBeVisible();
    await user.click(screen.getByRole("combobox", {name:"Prompt font size"}));
    await user.click(await screen.findByRole("option", {name:"18px"}));
    expect(screen.getByRole("textbox", {name:"Prompt text"})).toHaveStyle({fontSize:"18px"});
  });

  it("traps expanded prompt and confirmation focus, dismisses one Escape layer, and resets after discard", () => {
    const update = vi.fn();
    const view = render(<ReactFlowProvider>
      <button type="button">Outside editor</button>
      <NodeBananaUpstreamHeader runtimeData={{ canonicalKind: "input.prompt", id: "expanded", config: { text: "Initial prompt" } }} position={{ x: 0, y: 30 }} width={300} selected onUpdateNodeData={update} />
    </ReactFlowProvider>);
    const opener = screen.getByTitle("Expand editor");
    opener.focus();
    fireEvent.click(opener);
    const text = screen.getByRole("textbox", { name: "Prompt text" });
    expect(text).toHaveFocus();
    fireEvent.change(text, { target: { value: "Draft prompt" } });
    screen.getByRole("button", { name: "Outside editor" }).focus();
    expect(screen.getByRole("combobox", { name: "Prompt font size" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Submit" })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    const confirmation = screen.getByRole("dialog", { name: "Unsaved prompt changes" });
    expect(within(confirmation).getByRole("button", { name: "Close" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(within(confirmation).getByRole("button", { name: "Submit" })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Unsaved prompt changes" })).not.toBeInTheDocument();
    expect(text).toHaveValue("Draft prompt");
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(opener).toHaveFocus();
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(opener);
    expect(screen.getByRole("textbox", { name: "Prompt text" })).toHaveValue("Initial prompt");
    expect(screen.queryByRole("dialog", { name: "Unsaved prompt changes" })).not.toBeInTheDocument();
    view.unmount();
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it("exposes the required/optional header control for input.video", () => {
    const onUpdateNodeData = vi.fn();
    render(
      <ReactFlowProvider>
        <NodeBananaUpstreamHeader
          runtimeData={{
            id: "video-input-header",
            canonicalKind: "input.video",
            config: { presentation: { isOptional: false } },
          }}
          position={{ x: 0, y: 30 }}
          width={300}
          selected
          host={{ writable: true }}
          onUpdateNodeData={onUpdateNodeData}
        />
      </ReactFlowProvider>,
    );

    fireEvent.click(screen.getByTitle("Mark input as optional"));
    expect(onUpdateNodeData).toHaveBeenCalledWith("video-input-header", {
      config: { presentation: { isOptional: true } },
    });
    cleanup();
  });

  it("disables actual hosted mutation controls in read-only mode", () => {
    const onUpdateNodeData = vi.fn();
    const onRegenerateNode = vi.fn();
    const { container } = render(
      <ReactFlowProvider>
        <NodeBananaUpstreamHeader
          runtimeData={{ canonicalKind: "generate.image", id: "read-only-generation", config: { prompt: "ready", modelKey: "model", parameters: {} } }}
          position={{ x: 0, y: 30 }}
          width={300}
          selected
          host={{ writable: false }}
          onUpdateNodeData={onUpdateNodeData}
          onRegenerateNode={onRegenerateNode}
        />
        <NodeBananaUpstreamNode
          {...({
            id: "read-only-input",
            type: "canonicalNode",
            data: { canonicalKind: "input.image", config: { assetId: null } },
            selected: false,
            positionAbsolute: { x: 0, y: 0 },
            host: { writable: false, onInputMediaUpload: vi.fn() },
            onUpdateNodeData,
          } as unknown as NodeBananaUpstreamNodeProps)}
        />
        <NodeBananaUpstreamNode
          {...({
            id: "read-only-annotation",
            type: "canonicalNode",
            data: { canonicalKind: "edit.image.annotation", config: { parameters: { shapes: [] } }, sourceImage: tinyPng },
            selected: false,
            positionAbsolute: { x: 0, y: 0 },
            host: { writable: false },
            onUpdateNodeData,
          } as unknown as NodeBananaUpstreamNodeProps)}
        />
      </ReactFlowProvider>,
    );

    const run = screen.getByRole("button", { name: /Run node unavailable/ });
    expect(run).toBeDisabled();
    fireEvent.click(run);
    expect(onRegenerateNode).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Choose image" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Choose image" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("button", { name: "Add annotations" })).toBeDisabled();
    expect(container.querySelector('input[type="file"]')).toBeDisabled();
    expect(onUpdateNodeData).not.toHaveBeenCalled();
    cleanup();
  });

  it("keeps the upstream annotation modal reachable", () => {
    expect(AnnotationModal).toBeTypeOf("function");
    expect(AnnotationModal.name).toBe("AnnotationModal");
  });

  it("does not expose unsupported local annotation source controls", () => {
    const { container } = render(
      <ReactFlowProvider>
        <NodeBananaUpstreamNode
          {...({
            id: "annotation-local-disabled",
            type: "canonicalNode",
            data: {
              canonicalKind: "edit.image.annotation",
              config: { parameters: { shapes: [] } },
            },
            selected: false,
            positionAbsolute: { x: 0, y: 0 },
          } as unknown as NodeBananaUpstreamNodeProps)}
        />
      </ReactFlowProvider>,
    );

    expect(screen.getByText("Local annotation uploads are unavailable in the hosted graph.")).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove image" })).toBeNull();
  });

  it.each([
    ["input.image", "image"],
    ["input.audio", "audioFile"],
    ["input.video", "video"],
  ] as const)("persists %s removal as a null canonical asset", (canonicalKind, field) => {
    expect(canonicalPatchForNode(
      { canonicalKind, config: { assetId: "asset-before" } },
      { [field]: null },
    )).toMatchObject({ config: { assetId: null } });
  });

  it("persists Prompt variable names and clears them without leaking transient fields", () => {
    expect(canonicalPatchForNode(
      { canonicalKind: "input.prompt", config: { text: "hello" } },
      { variableName: "subject" },
    )).toEqual({ config: { text: "hello", variableName: "subject" } });
    expect(canonicalPatchForNode(
      { canonicalKind: "input.prompt", config: { text: "hello", variableName: "subject" } },
      { variableName: "" },
    )).toEqual({ config: { text: "hello" } });
  });

  it("routes the actual Prompt variable dialog through durable canonical config", () => {
    const onUpdateNodeData = vi.fn();
    render(
      <ReactFlowProvider>
        <NodeBananaUpstreamNode
          {...({
            id: "prompt-variable",
            type: "canonicalNode",
            data: { canonicalKind: "input.prompt", config: { text: "A portrait" } },
            selected: true,
            positionAbsolute: { x: 0, y: 0 },
            host: { writable: true },
            onUpdateNodeData,
          } as unknown as NodeBananaUpstreamNodeProps)}
        />
      </ReactFlowProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. color, style, subject"), {
      target: { value: "subject" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onUpdateNodeData).toHaveBeenCalledWith("prompt-variable", {
      config: { text: "A portrait", variableName: "subject" },
    });
    cleanup();
  });

  it.each(["generate.image", "generate.audio", "generate.video"] as const)(
    "persists %s output selection and clear through the canonical selection field",
    (canonicalKind) => {
      const data = { canonicalKind, config: { prompt: "test", modelKey: "model", parameters: {} } };
      expect(canonicalPatchForNode(data, { selectedOutputAssetId: "asset-next" })).toMatchObject({
        selectedOutputAssetId: "asset-next",
      });
      expect(canonicalPatchForNode(data, { selectedOutputAssetId: null })).toMatchObject({
        selectedOutputAssetId: null,
      });
    },
  );

  it.each(["edit.image.removeBackground", "edit.video.frameGrab"] as const)(
    "clears %s canonical selection only when its upstream image output is cleared",
    (canonicalKind) => {
      const data = { canonicalKind, config: {}, selectedOutputAssetId: "asset-previous" };
      expect(canonicalPatchForNode(data, { outputImage: null })).toMatchObject({ selectedOutputAssetId: null });
      expect(canonicalPatchForNode(data, { outputImage: "blob:replacement" })).not.toHaveProperty("selectedOutputAssetId");
      expect(canonicalPatchForNode(data, {})).not.toHaveProperty("selectedOutputAssetId");
      expect(canonicalPatchForNode(data, { outputImage: null, selectedOutputAssetId: "asset-next" })).toMatchObject({
        selectedOutputAssetId: "asset-next",
      });
    },
  );

  it.each(["generate.image", "generate.audio", "generate.video"] as const)(
    "replaces %s parameters and clears its previous input schema",
    (canonicalKind) => {
      const data = {
        canonicalKind,
        config: {
          prompt: "test",
          modelKey: "old-model",
          parameters: {
            stale: "must be removed",
            inputSchema: [{ name: "old", type: "text" }],
          },
        },
      };

      expect(canonicalPatchForNode(data, {
        parameters: { fresh: 7 },
        inputSchema: undefined,
      })).toEqual({
        config: {
          prompt: "test",
          modelKey: "old-model",
          parameters: { fresh: 7 },
        },
      });
    },
  );

  it.each(["generate.image", "generate.audio", "generate.video"] as const)(
    "clears the %s model key when upstream selects its empty placeholder",
    (canonicalKind) => {
      expect(canonicalPatchForNode(
        {
          canonicalKind,
          config: {
            prompt: "test",
            modelKey: "provider/old-model",
            parameters: { stale: true, inputSchema: [{ name: "old", type: "text" }] },
          },
        },
        {
          selectedModel: { provider: "fal", modelId: "", displayName: "Select model..." },
          parameters: {},
          inputSchema: undefined,
        },
      )).toEqual({
        config: { prompt: "test", modelKey: null, parameters: {} },
      });
    },
  );

  it.each(["generate.image", "generate.audio", "generate.video"] as const)(
    "keeps the explicit Expand state transient for %s",
    (canonicalKind) => {
      expect(canonicalPatchForNode(
        {
          canonicalKind,
          config: { prompt: "test", modelKey: "model", parameters: {} },
        },
        { parametersExpanded: true },
      )).toEqual({
        config: { prompt: "test", modelKey: "model", parameters: {} },
        __upstreamTransient: { parametersExpanded: true },
      });
    },
  );

  it.each(["generate.image", "generate.audio", "generate.video"] as const)(
    "uses the upstream Browse UI with only Leesfield-hosted models for %s",
    async (canonicalKind) => {
      const modelKey = canonicalKind === "generate.image" ? "nano-banana-pro" : `${canonicalKind}-model`;
      const capability = canonicalKind === "generate.image"
        ? "text-to-image"
        : canonicalKind === "generate.video"
          ? "text-to-video"
          : "text-to-audio";
      const hostedModel = {
        id: `hosted-${canonicalKind}`,
        name: `Hosted ${canonicalKind}`,
        description: null,
        provider: "hf_space" as const,
        capabilities: [capability],
      };
      const selectedModel = {
        provider: canonicalKind === "generate.image" ? "gemini" : "fal",
        modelId: modelKey,
        displayName: "Selected model",
      } as const;
      const onUpdateNodeData = vi.fn();
      const { unmount } = render(
        <ReactFlowProvider>
          <NodeBananaUpstreamNode
            {...({
              id: `browse-${canonicalKind}`,
              type: "canonicalNode",
              data: {
                canonicalKind,
                config: { prompt: "test", modelKey, parameters: {} },
                selectedModel,
              },
              selected: true,
              positionAbsolute: { x: 0, y: 0 },
              host: {
                writable: true,
                hostedModels: [hostedModel],
              },
              onUpdateNodeData,
            } as unknown as NodeBananaUpstreamNodeProps)}
          />
          <NodeBananaUpstreamHeader
            runtimeData={{
              id: `browse-${canonicalKind}`,
              canonicalKind,
              config: { prompt: "test", modelKey, parameters: {} },
              selectedModel,
            }}
            position={{ x: 0, y: 30 }}
            width={300}
            selected
            host={{ writable: true }}
          />
        </ReactFlowProvider>,
      );

      const browse = screen.getByRole("button", { name: "Browse models" });
      expect(browse).toBeEnabled();
      fireEvent.click(browse);
      await waitFor(() => expect(screen.getByPlaceholderText("Search models...")).toBeVisible());
      const dialog = screen.getByRole("dialog", { name: "Browse Models" });
      expect(within(dialog).getByRole("button", { name: new RegExp(hostedModel.name) })).toBeVisible();
      fireEvent.click(within(dialog).getByRole("button", { name: new RegExp(hostedModel.name) }));
      await waitFor(() => expect(onUpdateNodeData).toHaveBeenCalledWith(
        `browse-${canonicalKind}`,
        expect.objectContaining({
          config: expect.objectContaining({ modelKey: hostedModel.id, parameters: {} }),
        }),
      ));
      unmount();
      cleanup();
    },
  );

  it.each(["generate.image", "generate.audio", "generate.video"] as const)(
    "edits %s parameters in the original side panel when inline settings are off",
    async (kind) => {
      const key = `side-panel-${kind}`;
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ items: [{ key, provider: "fal", type: kind.slice(9), parameters: { steps: { default: 10, label: "Steps" } } }] }) })));
      const data = { canonicalKind: kind, config: { prompt: "preserve prompt", modelKey: key, parameters: { steps: 10 } }, selectedModel: { provider: "fal", modelId: key, displayName: "Model" } };
      panelSelection.nodes = [{ id: "selected", selected: true, position: { x: 0, y: 0 }, data }];
      const update = vi.fn();
      const host = { inlineParametersEnabled: false, writable: true, onUpdateNodeData: update, resolveNodeData: () => data };
      const view = render(<ReactFlowProvider><NodeBananaUpstreamControlPanel host={host} /></ReactFlowProvider>);
      const panel = await screen.findByRole("region", { name: /Generate .* Settings/ });
      const field = await within(panel).findByDisplayValue("10");
      fireEvent.change(field, { target: { value: "12" } }); fireEvent.blur(field);
      await waitFor(() => expect(update).toHaveBeenCalledWith("selected", { config: { prompt: "preserve prompt", modelKey: key, parameters: { steps: 12 } } }));
      view.rerender(<ReactFlowProvider><NodeBananaUpstreamControlPanel host={{ ...host, inlineParametersEnabled: true }} /></ReactFlowProvider>);
      expect(screen.queryByRole("region", { name: /Generate .* Settings/ })).not.toBeInTheDocument();
      view.rerender(<ReactFlowProvider><NodeBananaUpstreamControlPanel host={{ ...host, writable: false }} /></ReactFlowProvider>);
      expect(screen.queryByRole("region", { name: /Generate .* Settings/ })).not.toBeInTheDocument();
      panelSelection.nodes = [...panelSelection.nodes, { ...panelSelection.nodes[0], id: "second" }];
      view.rerender(<ReactFlowProvider><NodeBananaUpstreamControlPanel host={host} /></ReactFlowProvider>);
      expect(screen.queryByRole("region", { name: /Generate .* Settings/ })).not.toBeInTheDocument();
      view.unmount(); panelSelection.nodes = [];
    },
  );

  it.each(["generate.image", "generate.audio", "generate.video"] as const)(
    "honors the disabled inline settings preference for %s",
    (kind) => {
      const view = renderPresenter({ kind, data: { config: { prompt: "", modelKey: "model", parameters: {} }, selectedModel: { provider: "fal", modelId: "model", displayName: "Model" } }, host: { inlineParametersEnabled: false }, assertBody: () => undefined }, vi.fn(), vi.fn());
      expect(within(view.body).queryByRole("button", { name: "Expand parameters" })).not.toBeInTheDocument();
      expect(view.body.querySelector('[id^="params-"]')).toBeNull();
      view.unmount();
    },
  );

  it.each(["generate.image", "generate.audio", "generate.video"] as const)(
    "persists a %s ModelParameters deletion as a replacement snapshot",
    async (canonicalKind) => {
      const modelKey = `deletion-${canonicalKind}-model`;
      vi.stubGlobal("fetch", vi.fn(async () => ({
        ok: true,
        json: async () => ({
          items: [{
            key: modelKey,
            provider: "fal",
            type: canonicalKind === "generate.image" ? "image" : canonicalKind === "generate.video" ? "video" : "audio",
            parameters: {
              stale: { default: "old value", label: "Stale" },
              keep: { default: "keep value", label: "Keep" },
            },
          }],
        }),
        blob: async () => new Blob(),
      })));

      const onUpdateNodeData = vi.fn();
      const view = renderPresenter({
        kind: canonicalKind,
        data: {
          config: {
            prompt: "test",
            modelKey,
            parameters: { stale: "old value", keep: "keep value" },
          },
          selectedModel: { provider: "fal", modelId: modelKey, displayName: "Model" },
        },
        assertBody: () => undefined,
      }, onUpdateNodeData, vi.fn());

      const parameter = await waitFor(() => within(view.body).getByPlaceholderText("old value"));
      fireEvent.focus(parameter);
      fireEvent.change(parameter, { target: { value: "" } });
      fireEvent.blur(parameter);

      await waitFor(() => expect(onUpdateNodeData).toHaveBeenCalledWith(
        `node-${canonicalKind}`,
        { config: { prompt: "test", modelKey, parameters: { keep: "keep value" } } },
      ));
      view.unmount();
    },
  );

  it("bases an upstream generation mutation on the host's latest canonical data", async () => {
    const modelKey = "fresh-data-model";
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        items: [{
          key: modelKey,
          provider: "fal",
          type: "image",
          parameters: {
            steps: { default: 10, label: "Steps" },
          },
        }],
      }),
      blob: async () => new Blob(),
    })));

    const selectedModel = { provider: "fal" as const, modelId: modelKey, displayName: "Model" };
    const onUpdateNodeData = vi.fn();
    const view = renderPresenter({
      kind: "generate.image",
      data: {
        config: { prompt: "stale prompt", modelKey, parameters: { steps: 10 } },
        selectedModel,
      },
      host: {
        writable: true,
        resolveNodeData: () => ({
          canonicalKind: "generate.image",
          config: { prompt: "latest prompt", modelKey, parameters: { steps: 10 } },
          selectedModel,
        }),
      },
      assertBody: () => undefined,
    }, onUpdateNodeData, vi.fn());

    const parameter = await waitFor(() => within(view.body).getByDisplayValue("10"));
    fireEvent.change(parameter, { target: { value: "12" } });
    fireEvent.blur(parameter);

    await waitFor(() => expect(onUpdateNodeData).toHaveBeenCalledWith(
      "node-generate.image",
      { config: { prompt: "latest prompt", modelKey, parameters: { steps: 12 } } },
    ));
    view.unmount();
  });

  it("round-trips every renamed Node Banana control through canonical config", () => {
    expect(canonicalPatchForNode(
      { canonicalKind: "generate.image", config: { prompt: "old", modelKey: "old-model", parameters: { steps: 10 } } },
      {
        prompt: "new",
        selectedModel: { modelId: "new-model" },
        parameters: { steps: 20 },
        aspectRatio: "16:9",
        resolution: "2K",
        useGoogleSearch: true,
        useImageSearch: false,
      },
    )).toMatchObject({
      config: {
        prompt: "new",
        modelKey: "new-model",
        parameters: {
          steps: 20,
          aspectRatio: "16:9",
          resolution: "2K",
          useGoogleSearch: true,
          useImageSearch: false,
        },
      },
    });

    const cases: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
      ["edit.image.resize", { width: 640, height: 480, quality: 0.8 }, { width: 640, height: 480, quality: 0.8 }],
      ["edit.image.removeBackground", { model: "isnet" }, { model: "isnet" }],
      ["edit.image.splitGrid", { gridRows: 3, gridCols: 4, rowOffsets: [0.3] }, { rows: 3, cols: 4, rowOffsets: [0.3] }],
      ["edit.image.gif", { fps: 12, clipOrder: ["edge-2", "edge-1"] }, { fps: 12, clipOrder: ["edge-2", "edge-1"] }],
      ["edit.video.stitch", { loopCount: 2, stripAudio: true, clipOrder: ["edge-2", "edge-1"] }, { repeat: 2, stripAudio: true, clipOrder: ["edge-2", "edge-1"] }],
      ["edit.video.trim", { startTime: 1.25, endTime: 5.75 }, { startMs: 1250, endMs: 5750 }],
      ["edit.video.frameGrab", { framePosition: "last" }, { position: "last" }],
      ["edit.video.easeCurve", { outputDuration: 2.75, easingPreset: "linear", bezierHandles: [0, 0, 1, 1] }, { outputDurationMs: 2750, easingPreset: "linear", bezier: [0, 0, 1, 1] }],
    ];

    for (const [canonicalKind, patch, parameters] of cases) {
      expect(canonicalPatchForNode(
        { canonicalKind, config: { parameters: {} } },
        patch,
      )).toMatchObject({ config: { parameters } });
    }
  });

  it("normalizes numeric image seeds at the canonical upstream boundary", () => {
    const data = {
      canonicalKind: "generate.image",
      config: { prompt: "test", modelKey: "mrfakename-z-image-turbo-v2", parameters: {} },
    };

    expect(canonicalPatchForNode(data, { parameters: { seed: 42 } })).toMatchObject({
      config: { parameters: { seed: "42" } },
    });
    expect(canonicalPatchForNode(
      {
        ...data,
        config: { ...data.config, parameters: { seed: 42 } },
      },
      { prompt: "next prompt" },
    )).toMatchObject({
      config: { prompt: "next prompt", parameters: { seed: "42" } },
    });
  });

  it("routes Output Gallery extract and audio removal through canonical host callbacks", () => {
    const onOutputGalleryExtract = vi.fn();
    const onOutputGalleryRemove = vi.fn();
    render(
      <ReactFlowProvider>
        <NodeBananaUpstreamNode
          {...({
            id: "gallery-actions",
            type: "canonicalNode",
            data: {
              canonicalKind: "output.gallery",
              config: { mediaType: "audio" },
              images: ["https://read.example/image-1"],
              imageRefs: ["image-1"],
              audios: ["https://read.example/audio-1"],
              audioRefs: ["audio-1"],
            },
            selected: false,
            positionAbsolute: { x: 0, y: 0 },
            host: { onOutputGalleryExtract, onOutputGalleryRemove },
          } as unknown as NodeBananaUpstreamNodeProps)}
        />
      </ReactFlowProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    expect(onOutputGalleryExtract).toHaveBeenCalledWith({
      nodeId: "gallery-actions",
      items: [
        { type: "image", src: "https://read.example/image-1", assetId: "image-1" },
        { type: "audio", src: "https://read.example/audio-1", assetId: "audio-1" },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Open audio 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onOutputGalleryRemove).toHaveBeenCalledWith({
      nodeId: "gallery-actions",
      index: 1,
      item: { type: "audio", src: "https://read.example/audio-1", assetId: "audio-1" },
    });
  });

  it("projects canonical operation values and execution state into upstream names", () => {
    expect(upstreamDataForNode({
      canonicalKind: "input.audio",
      config: { assetId: "audio-1", filename: "voice-over.wav" },
      audioFile: "https://read.example/voice-over.wav",
    })).toMatchObject({ filename: "voice-over.wav" });
    expect(upstreamDataForNode({
      canonicalKind: "edit.video.trim",
      executionStatus: "processing",
      encoderSupported: true,
      duration: 12.5,
      outputDimensions: { width: 1280, height: 720 },
      outputBytes: 4096,
      config: { parameters: { startMs: 1250, endMs: 5750, stripAudio: true } },
    })).toMatchObject({
      status: "loading",
      encoderSupported: true,
      duration: 12.5,
      outputDimensions: { width: 1280, height: 720 },
      outputBytes: 4096,
      startTime: 1.25,
      endTime: 5.75,
      stripAudio: true,
      parameters: { startMs: 1250, endMs: 5750, stripAudio: true },
    });
    expect(upstreamDataForNode({
      canonicalKind: "edit.video.easeCurve",
      executionStatus: "failed",
      config: { parameters: { outputDurationMs: 2750, easingPreset: "linear", bezier: [0, 0, 1, 1] } },
    })).toMatchObject({ status: "error", outputDuration: 2.75, bezierHandles: [0, 0, 1, 1] });

    expect(canonicalPatchForNode(
      { canonicalKind: "edit.video.trim", config: { parameters: { startMs: 0, endMs: 5_000 } } },
      { encoderSupported: false, duration: 9.25 },
    )).toMatchObject({
      __upstreamTransient: { encoderSupported: false, duration: 9.25 },
    });
  });

  it("opens the actual annotation modal from the rendered annotation node", () => {
    render(
      <ReactFlowProvider>
        <NodeBananaUpstreamNode
          {...({
            id: "annotation-open",
            type: "canonicalNode",
            data: { canonicalKind: "edit.image.annotation", config: { parameters: { shapes: [] } } },
            selected: false,
            positionAbsolute: { x: 0, y: 0 },
            host: {
              resolveNodeData: () => ({
                sourceImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAFAgI/69ZOLwAAAABJRU5ErkJggg==",
                annotations: [],
              }),
            },
          } as unknown as NodeBananaUpstreamNodeProps)}
        />
      </ReactFlowProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add annotations" }));
    expect(screen.getByRole("dialog", { name: "Annotation editor" })).toBeVisible();
  });
});
