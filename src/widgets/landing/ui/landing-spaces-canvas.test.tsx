import { screen } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { renderWithIntl } from "@/test-utils/intl";
import LandingSpacesCanvas, { createDemoGraph } from "./landing-spaces-canvas";
const state = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));
vi.mock("@xyflow/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@xyflow/react")>()),
  ReactFlow: (props: Record<string, unknown>) => {
    state.props = props;
    return null;
  },
}));
it("shows one prompt and three model/result branches without editor controls or execution", () => {
  renderWithIntl(<LandingSpacesCanvas />);
  const graph = createDemoGraph("prompt");
  expect(graph.nodes).toHaveLength(7);
  expect(graph.edges).toHaveLength(6);
  expect(graph.edges.filter((edge) => edge.source === "prompt")).toHaveLength(
    3,
  );
  expect(
    graph.nodes.filter((node) => node.id.endsWith("-result")),
  ).toHaveLength(3);
  expect(screen.queryByRole("button")).toBeNull();
  expect(state.props.nodesConnectable).toBe(false);
  expect(state.props.onNodesChange).toBeTypeOf("function");
  expect(state.props.onRunNode).toBeUndefined();
  expect(state.props.preventScrolling).toBe(false);
});
