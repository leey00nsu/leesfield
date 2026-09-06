import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import koMessages from "@/shared/i18n/messages/ko.json";
import { canonicalNodeKinds, canonicalNodeRegistry, type CanonicalNodeKind } from "@/shared/generation-graph/node-registry";
import { defaultConfigForKind } from "../../runtime/node-banana/node-banana-runtime-adapter";
import { nodeBananaHostedHeaderContract, nodeBananaNodeGeometry } from "../../model/node-banana-node-inventory";

const mocks = vi.hoisted(() => ({
  updateConfig: vi.fn(),
  edges: [] as Array<{ target: string; targetHandle?: string | null }>,
}));

vi.mock("@xyflow/react", () => ({
  Handle: ({ id, type, style, "aria-label": ariaLabel }: { id: string; type: string; style?: { top?: string }; "aria-label"?: string }) => <span data-handle-id={id} data-handle-type={type} data-handle-top={style?.top} aria-label={ariaLabel} />,
  NodeResizer: ({ minWidth, minHeight }: { minWidth: number; minHeight: number }) => <span data-node-resizer="" data-min-width={minWidth} data-min-height={minHeight} />,
  Position: { Left: "left", Right: "right" },
  useEdges: () => mocks.edges,
}));

vi.mock("../../model/node-authoring-context", () => ({
  useNodeAuthoring: () => ({
    graphId: "graph-parity",
    imageModels: [],
    videoModels: [],
    audioModels: [],
    isLoading: false,
    error: null,
    retry: vi.fn(),
    backgroundRemovalAvailable: true,
    writable: true,
    updateCanonicalNodeConfig: mocks.updateConfig,
    prepareImageNodeExecution: vi.fn().mockResolvedValue(1),
    prepareNodeExecution: vi.fn().mockResolvedValue(1),
    getImageNodeInputReadiness: vi.fn(),
    getNodeRunReadiness: () => ({ ready: true, reasons: [] }),
    getNodePromptInput: () => ({ connected: false, text: null }),
    getNodeInputAssetId: () => null,
    isNodePortConnected: () => false,
    updateImageNodeConfig: vi.fn(),
    duplicateImageNode: vi.fn(),
    deleteImageNode: vi.fn(),
  }),
}));

vi.mock("./media-node-controls", () => ({
  MediaInputNodeControls: () => <div data-testid="media-input-controls" />,
  MediaOutputNodeControls: () => <div data-testid="media-output-controls" />,
}));
vi.mock("./image-operation-node-controls", () => ({
  ImageOperationNodeControls: () => <div data-testid="image-operation-controls" />,
}));
vi.mock("./video-operation-node-controls", () => ({
  VideoOperationNodeControls: () => <div data-testid="video-operation-controls" />,
}));
vi.mock("./generation-node-execution", () => ({
  GenerationNodeExecution: () => <button type="button" data-node-run aria-label="Body run" />,
}));

import { CanonicalNode } from "./canonical-node";
import { GenerationNode } from "./generation-node";

function renderNode(kind: CanonicalNodeKind) {
  const data = {
    canonicalKind: kind,
    configVersion: 1,
    config: defaultConfigForKind(kind),
    selectedOutputAssetId: null,
    ports: canonicalNodeRegistry[kind].ports,
    supported: true,
    supportReason: null,
  };
  const props = {
    id: `node-${kind}`,
    data,
    selected: true,
    type: kind.startsWith("generate.") ? "generationNode" : "canonicalNode",
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  };
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      {kind.startsWith("generate.")
        ? <GenerationNode {...props} type="generationNode" />
        : <CanonicalNode {...props} type="canonicalNode" />}
    </NextIntlClientProvider>,
  );
}

// Production Constructor uses the vendored presenter/header, tested in the
// upstream components and browser suites; there is no legacy implementation.
const legacyKinds = canonicalNodeKinds.filter((kind) => kind !== "process.promptConstructor");
describe("legacy Node Banana presenter parity", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.edges = [];
  });

  it("renders the hosted FloatingNodeHeader action contract for every supported Node", () => {
    for (const kind of legacyKinds) {
      const view = renderNode(kind);
      const article = screen.getByRole("article");
      const header = article.querySelector<HTMLElement>('[data-node-banana-component="FloatingNodeHeader"]');
      expect(header, kind).not.toBeNull();
      const actions = nodeBananaHostedHeaderContract[kind];

      expect(within(header as HTMLElement).queryByRole("button", { name: /댓글/ }), kind)
        .toBe(actions.includes("comment") ? within(header as HTMLElement).getByRole("button", { name: /댓글/ }) : null);
      expect(Boolean(within(header as HTMLElement).queryByRole("button", { name: /필수|선택/ })), kind)
        .toBe(actions.includes("required"));
      expect(Boolean(within(header as HTMLElement).queryByRole("button", { name: /편집기 펼치기|편집기 접기/ })), kind)
        .toBe(actions.includes("expand"));
      expect(Boolean(within(header as HTMLElement).queryByRole("button", { name: "노드 실행" })), kind)
        .toBe(actions.includes("run"));
      view.unmount();
    }
  });

  it("keeps Prompt Required, comment and Expand visible and opens the upstream editor", async () => {
    const user = userEvent.setup();
    renderNode("input.prompt");

    expect(screen.getByRole("button", { name: "필수" })).toBeVisible();
    expect(screen.getByRole("button", { name: "댓글 추가" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "편집기 펼치기" }));
    expect(screen.getByRole("dialog", { name: "프롬프트 편집" })).toHaveAttribute(
      "data-node-banana-component",
      "PromptEditorModal",
    );
  });

  it("edits and persists a custom title from every real FloatingNodeHeader", async () => {
    const user = userEvent.setup();
    renderNode("edit.video.trim");
    await user.click(screen.getByRole("button", { name: "제목 편집" }));
    const input = screen.getByRole("textbox", { name: "사용자 지정 제목" });
    await user.type(input, "Cut A");
    await user.keyboard("{Enter}");

    expect(mocks.updateConfig).toHaveBeenCalledWith(
      "node-edit.video.trim",
      expect.objectContaining({ presentation: { customTitle: "Cut A" } }),
    );
  });

  it("renders upstream fixed and dynamic handle geometry instead of generic even spacing", () => {
    const output = renderNode("output.single");
    expect(output.container.querySelector('[data-handle-id="image"]')).toHaveAttribute("data-handle-top", "35%");
    expect(output.container.querySelector('[data-handle-id="video"]')).toHaveAttribute("data-handle-top", "50%");
    expect(output.container.querySelector('[data-handle-id="audio"]')).toHaveAttribute("data-handle-top", "65%");
    output.unmount();

    mocks.edges = [
      { target: "node-edit.image.gif", targetHandle: "image-0" },
      { target: "node-edit.image.gif", targetHandle: "image-3" },
    ];
    const gif = renderNode("edit.image.gif");
    expect([...gif.container.querySelectorAll<HTMLElement>('[data-handle-id^="image-"]')].map((handle) => handle.dataset.handleId)).toEqual([
      "image-0",
      "image-1",
      "image-2",
      "image-3",
      "image-4",
    ]);
    expect(screen.getByText("Frame 5")).toBeInTheDocument();
  });

  it("renders the upstream pass-through target and source handles on every Input node", () => {
    const expected = {
      "input.image": [["reference", "target", "Ref"], ["image", "source", "Image"]],
      "input.audio": [["audio", "target", "Audio"], ["audio", "source", "Audio"]],
      "input.video": [["video", "target", "Video"], ["video", "source", "Video"]],
      "input.prompt": [["text", "target", "Text"], ["text", "source", "Text"]],
    } as const;

    for (const [kind, handles] of Object.entries(expected)) {
      const view = renderNode(kind as CanonicalNodeKind);
      const actual = [...view.container.querySelectorAll<HTMLElement>("[data-handle-id]")].map((handle) => [
        handle.dataset.handleId,
        handle.dataset.handleType,
        handle.getAttribute("aria-label"),
      ]);
      expect(actual, kind).toEqual(handles);
      view.unmount();
    }
  });

  it("uses every upstream default footprint and exposes its resize affordance", () => {
    for (const kind of legacyKinds) {
      const view = renderNode(kind);
      const article = screen.getByRole("article");
      const resizer = article.querySelector<HTMLElement>("[data-node-resizer]");
      const geometry = nodeBananaNodeGeometry[kind];

      expect(article, kind).toHaveStyle({
        width: `${geometry.width}px`,
        minHeight: `${geometry.height}px`,
      });
      expect(resizer, kind).toHaveAttribute("data-min-width", String(geometry.minWidth));
      expect(resizer, kind).toHaveAttribute("data-min-height", String(geometry.minHeight));
      view.unmount();
    }
  });
});
