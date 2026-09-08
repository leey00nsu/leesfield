import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";

import messages from "@/shared/i18n/messages/en.json";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";

const mocks = vi.hoisted(() => ({
  updateConfig: vi.fn(),
  refetch: vi.fn(),
  selectOutput: vi.fn(),
  start: vi.fn(),
  runBrowser: vi.fn(),
}));

vi.mock("../../model/node-authoring-context", () => ({
  useNodeAuthoring: () => ({
    graphId: "graph-1",
    prepareNodeExecution: vi.fn().mockResolvedValue(1),
    writable: true,
    updateCanonicalNodeConfig: mocks.updateConfig,
    getNodeInputAssetId: () => "asset-image",
    selectNodeOutputAsset: mocks.selectOutput,
  }),
}));

vi.mock("../../hook/use-node-executions", () => ({
  useNodeExecutions: () => ({ data: [], isError: false, refetch: mocks.refetch }),
  useStartNodeExecution: () => ({ mutateAsync: mocks.start, isPending: false, isError: false }),
  useCancelNodeExecution: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
}));

vi.mock("../../lib/browser-image-operation-runner", () => ({
  runBrowserImageOperation: mocks.runBrowser,
}));

vi.mock("@/features/media-assets/hook/use-media-assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/media-assets/hook/use-media-assets")>()),
  useMediaAsset: (id: string | null) => ({
    data: id === "asset-image"
      ? { id: "asset-image", type: "image", url: "https://read.example/source.png" }
      : id === "asset-old"
        ? { id: "asset-old", type: "image", url: "https://read.example/old.png" }
      : undefined,
  }),
}));

vi.mock("./node-banana-annotation-editor", () => ({
  NodeBananaAnnotationEditor: ({ open, onSave }: { open: boolean; onSave: (shapes: unknown[], preview: { blob: Blob }) => void }) => open ? (
    <dialog open aria-label="Annotation editor" data-node-banana-component="AnnotationModal">
      <button type="button" onClick={() => onSave(
        [{ id: "shape-1", type: "rectangle", x: 1, y: 2, width: 3, height: 4, fill: null, stroke: "#ef4444", strokeWidth: 2, opacity: 1 }],
        { blob: new Blob(["annotated"], { type: "image/png" }) },
      )}>Done</button>
    </dialog>
  ) : null,
}));

import { ImageOperationNodeControls } from "./image-operation-node-controls";

function renderControls(
  kind: Parameters<typeof ImageOperationNodeControls>[0]["kind"],
  parameters: Record<string, CanonicalJsonValue>,
  selectedOutputAssetId: string | null = null,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ImageOperationNodeControls
          id="image-operation-1"
          kind={kind}
          data={{ canonicalKind: kind, configVersion: 1, config: { parameters }, selectedOutputAssetId, ports: [], supported: true, supportReason: null }}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ImageOperationNodeControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:annotation-preview"),
      revokeObjectURL: vi.fn(),
    });
    mocks.start.mockResolvedValue({
      executionId: "execution-1",
      plan: { kind: "edit.image.annotation" },
    });
    mocks.runBrowser.mockResolvedValue([{ id: "asset-annotated" }]);
  });

  it("keeps the newly flattened preview visible while a previous durable output exists", async () => {
    renderControls("edit.image.annotation", { shapes: [] }, "asset-old");
    expect(screen.getByRole("img", { name: "Annotated result" })).toHaveAttribute(
      "src",
      "https://read.example/old.png",
    );

    fireEvent.click(screen.getByRole("button", { name: /Add annotations/ }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(screen.getByRole("img", { name: "Annotated result" })).toHaveAttribute(
      "src",
      "blob:annotation-preview",
    );
    await waitFor(() => expect(mocks.runBrowser).toHaveBeenCalled());
  });

  it("persists, previews, executes, and selects the flattened Annotation result", async () => {
    renderControls("edit.image.annotation", { shapes: [] });
    expect(screen.queryByText(/pixel coordinates/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add annotations/ }));
    expect(screen.getByRole("dialog", { name: "Annotation editor" })).toHaveAttribute("data-node-banana-component", "AnnotationModal");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(mocks.updateConfig).toHaveBeenCalledWith("image-operation-1", {
      parameters: { shapes: [{ id: "shape-1", type: "rectangle", x: 1, y: 2, width: 3, height: 4, fill: null, stroke: "#ef4444", strokeWidth: 2, opacity: 1 }] },
    });
    expect(screen.getByRole("img", { name: "Annotated result" })).toHaveAttribute("src", "blob:annotation-preview");
    await waitFor(() => expect(mocks.runBrowser).toHaveBeenCalledWith(expect.objectContaining({
      graphId: "graph-1",
      nodeId: "image-operation-1",
    })));
    await waitFor(() => expect(mocks.selectOutput).toHaveBeenCalledWith(
      "image-operation-1",
      "asset-annotated",
    ));
  });

  it("exposes every persisted Resize and GIF parameter instead of silently using hidden defaults", () => {
    const resize = renderControls("edit.image.resize", { mode: "exact", width: 1024, height: 768, fit: "contain", padColor: "#00000000", format: "webp", quality: 0.8 });
    expect(screen.getByRole("combobox", { name: "Fit" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Pad color" })).toHaveValue("#00000000");
    expect(screen.getByRole("spinbutton", { name: "Quality" })).toHaveValue(0.8);
    resize.unmount();

    renderControls("edit.image.gif", { fps: 8, loopCount: 0, colorCount: 128, dither: false, targetMaxBytes: 131072 });
    expect(screen.getByRole("spinbutton", { name: "Loop count" })).toHaveValue(0);
    expect(screen.getByRole("switch", { name: "Dither" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Target (KB)" })).toHaveValue(128);
  });
});
