import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import messages from "@/shared/i18n/messages/en.json";
import type { NodeBananaNodeData } from "../../runtime/node-banana/node-banana-runtime-adapter";

const mocks = vi.hoisted(() => ({
  updateConfig: vi.fn(),
  maxInputImages: 2,
  videoSupportsInitImage: true,
  promptInput: { connected: false, text: null } as { connected: boolean; text: string | null },
}));

vi.mock("@xyflow/react", () => ({
  Handle: ({ id, "aria-label": ariaLabel }: { id: string; "aria-label"?: string }) => (
    <span data-testid={`handle-${id}`} aria-label={ariaLabel} />
  ),
  NodeResizer: () => <span data-testid="node-resizer" />,
  Position: { Left: "left", Right: "right" },
}));

vi.mock("../../model/node-authoring-context", () => ({
  useNodeAuthoring: () => ({
    graphId: "graph-1",
    writable: true,
    updateCanonicalNodeConfig: mocks.updateConfig,
    prepareImageNodeExecution: vi.fn().mockResolvedValue(1),
    imageModels: [{
      type: "image",
      key: "image-a",
      label: "Image A",
      vendor: "Leesfield",
      provider: "gradio",
      parameters: {
        width: { ui: "range", label: "Width", min: 256, max: 2048, step: 64, default: 1024 },
      },
      meta: { max_input_images: mocks.maxInputImages },
      isActive: true,
      isDefault: true,
    }],
    videoModels: [{
      type: "video",
      key: "video-a",
      label: "Video A",
      vendor: "Leesfield",
      provider: "hf_space",
      parameters: {
        durationSec: { ui: "range", label: "Duration", min: 1, max: 8, step: 0.5, default: 3 },
      },
      meta: { supports_init_image: mocks.videoSupportsInitImage },
      isActive: true,
      isDefault: true,
    }],
    audioModels: [{
      type: "audio",
      key: "audio-a",
      label: "Audio A",
      vendor: "Leesfield",
      provider: "hf_space",
      parameters: {
        speed: { ui: "range", label: "Speed", min: 0.5, max: 2, step: 0.1, default: 1 },
      },
      meta: {},
      isActive: true,
      isDefault: true,
    }],
    isLoading: false,
    error: null,
    retry: vi.fn(),
    getNodeRunReadiness: () => ({ ready: true, reasons: [] }),
    getNodePromptInput: () => mocks.promptInput,
  }),
}));

vi.mock("./generation-node-execution", () => ({
  GenerationNodeExecution: ({ mediaType, expanded }: { mediaType: string; expanded?: boolean }) => (
    <div data-generation-section="execution" data-media={mediaType}>
      {expanded ? "execution-expanded" : "execution-compact"}
    </div>
  ),
}));

import { GenerationNode } from "./generation-node";

const modelKeyByMedia = {
  image: "image-a",
  video: "video-a",
  audio: "audio-a",
} as const;

function data(mediaType: "image" | "video" | "audio"): NodeBananaNodeData {
  const kind = `generate.${mediaType}`;
  return {
    canonicalKind: kind,
    configVersion: 1,
    config: { prompt: `make ${mediaType}`, modelKey: modelKeyByMedia[mediaType], parameters: {} },
    selectedOutputAssetId: null,
    ports: [],
    supported: true,
    supportReason: null,
  };
}

function node(mediaType: "image" | "video" | "audio", selected = false) {
  return (
    <GenerationNode
      id={`node-${mediaType}`}
      data={data(mediaType)}
      selected={selected}
      type="generationNode"
      dragging={false}
      draggable
      selectable
      deletable
      zIndex={0}
      isConnectable
      positionAbsoluteX={0}
      positionAbsoluteY={0}
    />
  );
}

function renderNodes() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node("image")}
      {node("video")}
      {node("audio")}
    </NextIntlClientProvider>,
  );
}

describe("GenerationNode common presenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.maxInputImages = 2;
    mocks.videoSupportsInitImage = true;
    mocks.promptInput = { connected: false, text: null };
  });

  it("uses one compact anatomy for Image, Video, and Audio and never expands on selection", () => {
    const view = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        {node("image", true)}
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("make image")).toBeInTheDocument();
    expect(screen.getByText("execution-compact")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(view.container.querySelector("[data-generation-node]")).toHaveAttribute("data-generation-media", "image");
  });

  it("keeps the full section order and geometry identical across all generation media", () => {
    const view = renderNodes();
    screen.getAllByRole("button", { name: "Expand editor" }).forEach((button) => fireEvent.click(button));

    const articles = Array.from(view.container.querySelectorAll<HTMLElement>("[data-generation-node]"));
    expect(articles).toHaveLength(3);
    const anatomy = (article: HTMLElement) => Array.from(
      article.querySelectorAll<HTMLElement>("[data-generation-section]"),
      (section) => section.dataset.generationSection,
    );
    expect(anatomy(articles[0])).toEqual(["header", "authoring", "prompt", "model", "parameters", "execution"]);
    expect(anatomy(articles[1])).toEqual(anatomy(articles[0]));
    expect(anatomy(articles[2])).toEqual(anatomy(articles[0]));
    expect(articles.map((article) => article.className)).toEqual([
      articles[0].className,
      articles[0].className,
      articles[0].className,
    ]);

    const promptClasses = articles.map((article) => within(article).getByRole("textbox").className);
    expect(promptClasses).toEqual([promptClasses[0], promptClasses[0], promptClasses[0]]);
    for (const article of articles) {
      expect(within(article).getByRole("button", { name: /Model/i })).toBeInTheDocument();
      expect(within(article).getByRole("button", { name: /Parameters/i })).toBeInTheDocument();
    }
  });

  it("keeps only capability-supported media inputs while preserving the same labels", () => {
    const view = renderNodes();
    const articles = Array.from(view.container.querySelectorAll<HTMLElement>("[data-generation-node]"));
    expect(within(articles[0]).getAllByLabelText("Image")).toHaveLength(2);
    expect(within(articles[1]).getByLabelText("Image")).toBeInTheDocument();
    expect(within(articles[2]).queryByLabelText("Image")).not.toBeInTheDocument();
    for (const article of articles) expect(within(article).getByLabelText("Prompt")).toBeInTheDocument();
  });

  it("uses the same config adapter and catalog-driven defaults for image authoring", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <GenerationNode
          id="node-image"
          data={{ ...data("image"), config: { prompt: "new image", modelKey: null, parameters: {} } }}
          selected={false}
          type="generationNode"
          dragging={false}
          draggable
          selectable
          deletable
          zIndex={0}
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand editor" }));
    fireEvent.click(screen.getByRole("button", { name: /Model/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Image A/ }));

    expect(mocks.updateConfig).toHaveBeenCalledWith("node-image", expect.objectContaining({
      prompt: "new image",
      modelKey: "image-a",
      parameters: expect.objectContaining({ width: 1024 }),
    }));
  });

  it("disables the internal editor and uses a connected Prompt node without destroying the internal draft", () => {
    mocks.promptInput = { connected: true, text: "prompt from node" };
    const view = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        {node("image")}
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand editor" }));

    const promptEditor = screen.getByRole("textbox");
    expect(promptEditor).toBeDisabled();
    expect(promptEditor).toHaveValue("prompt from node");
    expect(screen.getByRole("textbox", { name: "Prompt from connected Prompt node" })).toBeDisabled();
    expect(mocks.updateConfig).not.toHaveBeenCalled();

    mocks.promptInput = { connected: false, text: null };
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        {node("image")}
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("textbox")).toBeEnabled();
    expect(screen.getByRole("textbox")).toHaveValue("make image");
  });

  it.each([
    ["image", "Width"],
    ["video", "Duration"],
    ["audio", "Speed"],
  ] as const)("opens the same Parameters popover for %s", async (mediaType, parameterLabel) => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        {node(mediaType)}
      </NextIntlClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Expand editor" }));
    await user.click(screen.getByRole("button", { name: /Parameters/i }));

    expect(screen.getByRole("spinbutton", { name: parameterLabel })).toBeInTheDocument();
  });
});
