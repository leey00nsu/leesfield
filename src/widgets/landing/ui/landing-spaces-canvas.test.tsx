import type { ComponentType } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeChange, NodeProps } from "@xyflow/react";
import { renderWithIntl } from "@/test-utils/intl";
import { validateCanonicalGraph } from "@/shared/generation-graph/canonical-graph";
import enMessages from "@/shared/i18n/messages/en.json";
import koMessages from "@/shared/i18n/messages/ko.json";
import type { SpaceEditorSession } from "@/features/node-studio/model/space-editor-store";
import type { SpaceFlowNode } from "@/features/node-studio/model/space-editor-flow";
import { spaceHandleId } from "@/features/node-studio/model/space-editor-ports";
import LandingSpacesCanvas, { createDemoGraph } from "./landing-spaces-canvas";

const state = vi.hoisted(() => ({ props: {} as Record<string, unknown>, session: null as SpaceEditorSession | null }));

vi.mock("@/features/node-studio/model/space-editor-store", async importOriginal => {
  const actual = await importOriginal<typeof import("@/features/node-studio/model/space-editor-store")>();
  return { ...actual, createSpaceEditorSession: (...args: Parameters<typeof actual.createSpaceEditorSession>) => {
    state.session = actual.createSpaceEditorSession(...args);
    return state.session;
  } };
});

// Keep the application presenters and session real; pointer geometry belongs to
// React Flow and can be checked with the accompanying browser stories.
vi.mock("@xyflow/react", async importOriginal => ({
  ...(await importOriginal<typeof import("@xyflow/react")>()),
  Background: () => null,
  Handle: () => null,
  NodeResizer: () => null,
  ReactFlow: (props: Record<string, unknown>) => {
    state.props = props;
    const nodes = props.nodes as SpaceFlowNode[];
    const Presenter = (props.nodeTypes as { space: ComponentType<Pick<NodeProps<SpaceFlowNode>, "data" | "selected">> }).space;
    return <>{nodes.map(node => <Presenter key={node.id} data={node.data} selected={Boolean(node.selected)} />)}</>;
  },
}));

beforeEach(() => { state.props = {}; state.session = null; });

describe("landing canonical demo", () => {
  it("keeps three model/result branches with registry-valid canonical ports and unchanged model keys", () => {
    const prompt = "User text: Run node · 모델/Image Input";
    const graph = createDemoGraph(prompt);
    expect(graph.schemaVersion).toBe(3);
    expect(graph.nodes).toHaveLength(7);
    expect(graph.edges).toHaveLength(6);
    expect(validateCanonicalGraph(graph)).toEqual([]);
    expect(graph.nodes.filter(node => node.kind === "generate.image").map(node => (node.config as { modelKey: string }).modelKey))
      .toEqual(["krea", "gpt", "zimage"]);
    expect(graph.nodes[0].config).toMatchObject({ text: prompt });
    expect(graph.edges.filter(edge => edge.sourceNodeId === "prompt")).toEqual([
      { id: "prompt-krea", sourceNodeId: "prompt", sourcePortId: "text", targetNodeId: "krea", targetPortId: "prompt", sortOrder: 0 },
      { id: "prompt-gpt", sourceNodeId: "prompt", sourcePortId: "text", targetNodeId: "gpt", targetPortId: "prompt", sortOrder: 0 },
      { id: "prompt-zimage", sourceNodeId: "prompt", sourcePortId: "text", targetNodeId: "zimage", targetPortId: "prompt", sortOrder: 0 },
    ]);
  });

  it.each(["ko", "en"] as const)("shows native read-only bodies and public static results in %s without editor actions or API requests", locale => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const messages = locale === "ko" ? koMessages : enMessages;
      const { container } = renderWithIntl(<LandingSpacesCanvas />, { locale, messages });
      expect(screen.getByTestId("landing-spaces-canvas")).toHaveAttribute("aria-label", messages.inferenceLanding.spaces.canvas);
      expect(container.querySelectorAll("[data-space-node]")).toHaveLength(7);
      expect(screen.getAllByRole("textbox")).toHaveLength(4);
      for (const input of screen.getAllByRole("textbox")) {
        expect(input).toHaveAttribute("readonly");
        expect(input).toHaveValue(messages.inferenceLanding.spaces.prompt);
      }
      expect(screen.getAllByRole("img").map(image => image.getAttribute("src"))).toEqual([
        "/assets/landing-comparison/krea-2.png", "/assets/landing-comparison/gpt-image-2.png", "/assets/landing-comparison/z-image.png",
      ]);
      expect(screen.queryByRole("button", { name: /Run this node|이 노드 실행|Browse models|모델 찾기|Upload|업로드|Add node|노드 추가/ })).toBeNull();
      expect(container.querySelector('[href^="/api/"]')).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });

  it("keeps drag positions in the local view while the canonical session rejects business edits", () => {
    const { container } = renderWithIntl(<LandingSpacesCanvas />);
    const session = state.session!;
    const original = session.getDocument();
    const durable = vi.fn();
    const stop = session.subscribeDurable(durable);
    expect(state.props.nodesConnectable).toBe(false);
    expect(state.props.nodesDraggable).toBe(true);
    expect((state.props.nodes as SpaceFlowNode[]).every(node => node.draggable)).toBe(true);
    expect(state.props.deleteKeyCode).toBeNull();
    expect(state.props.preventScrolling).toBe(false);
    expect(state.props.zoomOnScroll).toBe(false);
    expect(state.props.panOnDrag).not.toBe(false);
    act(() => {
      (state.props.onNodesChange as (changes: NodeChange<SpaceFlowNode>[]) => void)([
        { type: "position", id: "prompt", position: { x: 100, y: 250 }, dragging: true },
      ]);
    });
    expect((state.props.nodes as SpaceFlowNode[]).find(node => node.id === "prompt")?.position).toEqual({ x: 100, y: 250 });
    expect(session.getDocument()).toBe(original);
    expect(session.getSnapshot().writable).toBe(false);
    expect(session.dispatch({ type: "node.config.patch", nodeId: "prompt", patch: { text: "changed" } }).ok).toBe(false);
    fireEvent.keyDown(container, { key: "Delete" });
    expect(session.getDocument().nodes).toHaveLength(7);
    expect(durable).not.toHaveBeenCalled();
    const edges = state.props.edges as Array<{ sourceHandle: string; targetHandle: string }>;
    expect(edges[0]).toMatchObject({ sourceHandle: spaceHandleId({ direction: "output", portId: "text" }), targetHandle: spaceHandleId({ direction: "input", portId: "prompt" }) });
    stop();
  });
});
