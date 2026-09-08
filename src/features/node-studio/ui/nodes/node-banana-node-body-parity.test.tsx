import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";

import koMessages from "@/shared/i18n/messages/ko.json";
import {
  canonicalNodeKinds,
  canonicalNodeRegistry,
  type CanonicalNodeKind,
} from "@/shared/generation-graph/node-registry";
import { defaultConfigForKind } from "../../runtime/node-banana/node-banana-runtime-adapter";

const mocks = vi.hoisted(() => ({
  updateConfig: vi.fn(),
  edges: [] as Array<{ target: string; targetHandle?: string | null }>,
}));

vi.mock("@xyflow/react", () => ({
  Handle: ({ id }: { id: string }) => <span data-handle-id={id} />,
  NodeResizer: () => <span data-node-resizer="" />,
  Position: { Left: "left", Right: "right" },
  useEdges: () => mocks.edges,
}));

vi.mock("@/features/media-assets/hook/use-media-assets", () => ({
  mediaAssetKeys: { all: ["media-assets"] },
  useMediaAsset: () => ({ data: null, isError: false, isLoading: false }),
  useMediaAssetList: () => [],
  useMediaAssets: () => ({
    data: { pages: [{ items: [] }] },
    isError: false,
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  useResolvedNodeAssets: () => ({
    data: { groups: [] },
    isError: false,
    isLoading: false,
  }),
  useUploadMediaAsset: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

vi.mock("../../hook/use-node-executions", () => ({
  useNodeExecutions: () => ({ data: [], isError: false, refetch: vi.fn() }),
  useStartNodeExecution: () => ({ isPending: false, isError: false, mutateAsync: vi.fn() }),
  useCancelNodeExecution: () => ({ isPending: false, isError: false, mutateAsync: vi.fn() }),
}));

vi.mock("./node-banana-annotation-editor", () => ({
  NodeBananaAnnotationEditor: () => null,
}));

vi.mock("../../model/node-authoring-context", () => ({
  useNodeAuthoring: () => ({
    graphId: "graph-body-parity",
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
    getNodeInputAssetIds: () => [],
    isNodePortConnected: () => false,
    selectNodeOutputAsset: vi.fn(),
    updateImageNodeConfig: vi.fn(),
    duplicateImageNode: vi.fn(),
    deleteImageNode: vi.fn(),
  }),
}));

import { CanonicalNode } from "./canonical-node";
import { GenerationNode } from "./generation-node";

// Constructor ships only through the vendored runtime. Its actual body and edits
// are covered by node-banana-upstream-components.test.tsx and the browser suite.
const legacyKinds = canonicalNodeKinds.filter((kind) => kind !== "process.promptConstructor");
const bodySelector: Readonly<Record<Exclude<CanonicalNodeKind, "process.promptConstructor">, string>> = {
  "input.image": '[data-node-banana-component="ImageInputNode"]',
  "input.audio": '[data-node-banana-component="AudioInputNode"]',
  "input.video": '[data-node-banana-component="VideoInputNode"]',
  "input.prompt": '[data-node-banana-component="PromptNode"]',
  "generate.image": '[data-generation-node][data-generation-media="image"]',
  "generate.audio": '[data-generation-node][data-generation-media="audio"]',
  "generate.video": '[data-generation-node][data-generation-media="video"]',
  "edit.image.annotation": '[data-node-banana-kind="edit.image.annotation"]',
  "edit.image.resize": '[data-node-banana-kind="edit.image.resize"]',
  "edit.image.removeBackground": '[data-node-banana-kind="edit.image.removeBackground"]',
  "edit.image.splitGrid": '[data-node-banana-kind="edit.image.splitGrid"]',
  "edit.image.gif": '[data-node-banana-kind="edit.image.gif"]',
  "edit.video.stitch": '[data-node-banana-kind="edit.video.stitch"]',
  "edit.video.trim": '[data-node-banana-kind="edit.video.trim"]',
  "edit.video.frameGrab": '[data-node-banana-kind="edit.video.frameGrab"]',
  "edit.video.easeCurve": '[data-node-banana-kind="edit.video.easeCurve"]',
  "output.single": '[data-node-banana-component="OutputNode"]',
  "output.gallery": '[data-node-banana-component="OutputGalleryNode"]',
  "inspect.imageCompare": '[data-node-banana-component="ImageCompareNode"]',
};

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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        {kind.startsWith("generate.")
          ? <GenerationNode {...props} type="generationNode" />
          : <CanonicalNode {...props} type="canonicalNode" />}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("legacy Node Banana body presenters", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders a real, kind-specific body for every approved node", () => {
    expect(Object.keys(bodySelector)).toEqual(legacyKinds);
    for (const kind of legacyKinds) {
      const view = renderNode(kind);
      expect(view.container.querySelector(bodySelector[kind]), kind).not.toBeNull();
      view.unmount();
    }
  });

  it("keeps the upstream operation-specific controls instead of a generic parameter form", async () => {
    const probes: ReadonlyArray<[keyof typeof bodySelector, string]> = [
      ["edit.image.annotation", "button"],
      ["edit.image.resize", '[role="group"][aria-label="크기 조절 방식"]'],
      ["edit.image.removeBackground", '[data-node-banana-component="OperationPreview"]'],
      ["edit.image.splitGrid", 'input[aria-label="행"]'],
      ["edit.image.gif", '[data-node-banana-component="FrameFilmstrip"]'],
      ["edit.video.stitch", '[data-node-banana-component="ClipFilmstrip"]'],
      ["edit.video.trim", 'input[type="range"]'],
      ["edit.video.frameGrab", '[role="group"][aria-label="프레임 위치"]'],
      ["edit.video.easeCurve", '[role="combobox"]'],
    ];

    for (const [kind, selector] of probes) {
      const view = renderNode(kind);
      const body = view.container.querySelector(bodySelector[kind]);
      await waitFor(() => expect(body?.querySelector(selector), `${kind}: ${selector}`).not.toBeNull());
      view.unmount();
    }
  });

  it("keeps input, generation and output families on their actual upstream anatomy", () => {
    for (const kind of ["input.image", "input.audio", "input.video"] as const) {
      const view = renderNode(kind);
      expect(screen.getByRole("button", { name: /assets|replace asset|히스토리 파일/i }), kind).toBeInTheDocument();
      view.unmount();
    }

    const prompt = renderNode("input.prompt");
    expect(screen.getByPlaceholderText("만들고 싶은 것을 설명하세요…")).toBeInTheDocument();
    prompt.unmount();

    for (const kind of ["generate.image", "generate.audio", "generate.video"] as const) {
      const view = renderNode(kind);
      fireEvent.click(screen.getByRole("button", { name: "편집기 펼치기" }));
      expect(view.container.querySelector('[data-generation-section="authoring"]'), kind).not.toBeNull();
      expect(view.container.querySelector('[data-generation-section="execution"]'), kind).not.toBeNull();
      view.unmount();
    }

    for (const kind of ["output.single", "output.gallery", "inspect.imageCompare"] as const) {
      const view = renderNode(kind);
      expect(view.container.querySelector(bodySelector[kind]), kind).toHaveTextContent(/connect|연결/i);
      view.unmount();
    }
  });
});
