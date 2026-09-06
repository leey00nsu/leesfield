import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ nodeBanana: vi.fn() }));

vi.mock("./node-banana-studio", () => ({
  NodeBananaStudio: (props: unknown) => {
    mocks.nodeBanana(props);
    return <div data-testid="node-banana-runtime" />;
  },
}));

import type { GenerationGraphSnapshotDto } from "../model/graph-types";
import { NodeStudio } from "./node-studio";

const graph: GenerationGraphSnapshotDto = {
  id: "graph_1",
  title: "Graph",
  version: 1,
  schemaVersion: 3, groups: [],
  minimumWriterVersion: 3,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  nodes: [{
    id: "node_a",
    kind: "generate.image",
    position: { x: 0, y: 0 },
    configVersion: 1,
    config: { prompt: "preview prompt", modelKey: "model/a", parameters: {} },
    selectedOutputAssetId: null,
  }],
  edges: [],
};

describe("NodeStudio", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses Node Banana as the only writable runtime", () => {
    const onDraftChange = vi.fn();
    render(<NodeStudio graph={graph} onDraftChange={onDraftChange} />);

    expect(screen.getByTestId("node-banana-runtime")).toBeInTheDocument();
    expect(mocks.nodeBanana).toHaveBeenCalledWith(
      expect.objectContaining({ graph, onDraftChange, writable: true, readOnlyReason: null }),
    );
  });

  it("passes an unsupported canonical graph through as read-only", () => {
    render(
      <NodeStudio
        graph={{ ...graph, writable: false, readOnlyReason: "UNKNOWN_NODE_KIND" }}
        onDraftChange={vi.fn()}
      />,
    );

    expect(mocks.nodeBanana).toHaveBeenCalledWith(
      expect.objectContaining({ writable: false, readOnlyReason: "UNKNOWN_NODE_KIND" }),
    );
  });
});
