import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import koMessages from "@/shared/i18n/messages/ko.json";
import { canonicalNodeRegistry } from "@/shared/generation-graph/node-registry";

const mocks = vi.hoisted(() => ({
  promptInput: { connected: false, text: null } as { connected: boolean; text: string | null },
}));

vi.mock("@xyflow/react", () => ({
  Handle: ({ id, "aria-label": ariaLabel }: { id: string; "aria-label"?: string }) => <span data-testid={`handle-${id}`} aria-label={ariaLabel} />,
  NodeResizer: () => <span data-testid="node-resizer" />,
  Position: { Left: "left", Right: "right" },
  useEdges: () => [],
}));

vi.mock("../../model/node-authoring-context", () => ({
  useNodeAuthoring: () => ({
    writable: true,
    updateCanonicalNodeConfig: vi.fn(),
    getNodePromptInput: () => mocks.promptInput,
  }),
}));

vi.mock("./node-banana-floating-node-header", () => ({
  NodeBananaFloatingNodeHeader: ({ title }: { title: string }) => <div data-testid="floating-header">{title}</div>,
}));

import { CanonicalNode, UnsupportedCanonicalNode } from "./canonical-node";

describe("CanonicalNode Node Banana presentation", () => {
  beforeEach(() => {
    mocks.promptInput = { connected: false, text: null };
  });

  it("renders an unknown canonical kind with fallback geometry and preserved ports", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <UnsupportedCanonicalNode
          id="unknown-1"
          data={{
            canonicalKind: "future.customNode",
            configVersion: 1,
            config: { preserved: true },
            selectedOutputAssetId: null,
            ports: canonicalNodeRegistry["input.prompt"].ports,
            supported: false,
            supportReason: "UNKNOWN_NODE_KIND",
          }}
          selected={false}
          type="unsupportedCanonicalNode"
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

    expect(screen.getByRole("article", { name: "future.customNode" })).toHaveStyle({ width: "320px", minHeight: "180px" });
    expect(screen.getByText(/UNKNOWN_NODE_KIND/)).toBeInTheDocument();
    expect(screen.getAllByLabelText("Text")).toHaveLength(2);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders Prompt with the upstream full-bleed editor copy in the Korean locale", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <CanonicalNode
          id="prompt-1"
          data={{
            canonicalKind: "input.prompt",
            configVersion: 1,
            config: { text: "" },
            selectedOutputAssetId: null,
            ports: canonicalNodeRegistry["input.prompt"].ports,
            supported: true,
            supportReason: null,
          }}
          selected={false}
          type="canonicalNode"
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

    expect(screen.getByLabelText("Prompt", { selector: "article" })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "Describe what to generate...");
    expect(screen.getAllByLabelText("Text")).toHaveLength(2);
    expect(screen.queryByText(/Editing and execution|후속 미디어 통합/)).not.toBeInTheDocument();
  });

  it("prioritizes an incoming Prompt value and disables the preserved local editor", () => {
    mocks.promptInput = { connected: true, text: "upstream prompt" };
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <CanonicalNode
          id="prompt-relay"
          data={{
            canonicalKind: "input.prompt",
            configVersion: 1,
            config: { text: "local prompt" },
            selectedOutputAssetId: null,
            ports: canonicalNodeRegistry["input.prompt"].ports,
            supported: true,
            supportReason: null,
          }}
          selected={false}
          type="canonicalNode"
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

    expect(screen.getByRole("textbox", { name: "Text from connected Prompt node" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Text from connected Prompt node" })).toHaveValue("upstream prompt");
  });
});
