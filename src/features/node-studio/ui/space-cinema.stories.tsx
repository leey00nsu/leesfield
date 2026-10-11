import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CanvasProviders } from "@/shared/ui/canvas-providers";
import { defaultCinemaSettings } from "@/shared/cinema/cinema-contract";
import { runtimeImageModelsFixture, runtimeVideoModelsFixture } from "@/test-utils/fixtures/runtime-model-catalog";
import { projectGenerationModelSelectionDefaults } from "../model/generation-model-selection-defaults";
import type { GenerationGraphSnapshotDto } from "../model/graph-types";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { NodeBananaStudio } from "./node-banana-studio";

function SpaceCinemaPreview({ media = "image", connected = true, readonly = false, running = false }: { media?: "image" | "video"; connected?: boolean; readonly?: boolean; running?: boolean }) {
  const [client] = useState(() => {
    const value = new QueryClient({ defaultOptions: { queries: { enabled: false, staleTime: Infinity, retry: false } } });
    value.setQueryData(["prompt-presets", media, false], []);
    return value;
  });
  const [graph, setGraph] = useState<GenerationGraphSnapshotDto>(() => {
    const model = media === "image" ? runtimeImageModelsFixture[0] : runtimeVideoModelsFixture[0];
    const config = projectGenerationModelSelectionDefaults({}, { prompt: "A quiet street at dusk", modelKey: model.key, parameters: {},
      cinema: { ...defaultCinemaSettings(), camera: "16mm-film", lens: "modern-prime", composition: "medium", aperture: "f14", lighting: "window" } }, [model]);
    return { id: "cinema-space", title: "Cinema Studio", version: 1, schemaVersion: 3, minimumWriterVersion: 3, groups: [],
      createdAt: "2026-10-09T00:00:00Z", updatedAt: "2026-10-09T00:00:00Z",
      nodes: [
        ...(connected ? [{ id: "source", kind: "input.prompt", configVersion: 1, config: { text: "A woman walking across an old city square" }, position: { x: 30, y: 100 }, selectedOutputAssetId: null }] : []),
        { id: "cinema", kind: `generate.${media}`, configVersion: 1, config: config as CanonicalJsonValue, position: { x: connected ? 540 : 80, y: 80 }, selectedOutputAssetId: null },
      ], edges: connected ? [{ id: "prompt-edge", sourceNodeId: "source", sourcePortId: "text", targetNodeId: "cinema", targetPortId: "prompt", sortOrder: 0 }] : [] };
  });
  return <QueryClientProvider client={client}><CanvasProviders><main className="fixed inset-0 flex flex-col bg-neutral-900">
    <NodeBananaStudio graph={graph} catalog={{ imageModels: runtimeImageModelsFixture, videoModels: runtimeVideoModelsFixture, isLoading: false, error: null, retry: () => undefined }}
      writable={!readonly} readOnlyReason={readonly ? "READ_ONLY" : null} prepareImageNodeExecution={async () => graph.version}
      onDraftChange={draft => setGraph(previous => ({ ...previous, ...draft, version: previous.version + 1 }))}
      onRegenerateNode={async () => undefined}
      resolveUpstreamNodeData={id => id === "cinema" && running ? { executionStatus: "processing", repeatProgress: { completed: 0, failed: 0, total: 1, running: true } } : {}} />
    <output className="sr-only" aria-label="Cinema canonical config">{JSON.stringify(graph.nodes.find(node => node.id === "cinema")?.config)}</output>
  </main></CanvasProviders></QueryClientProvider>;
}
const meta = { title: "Features/Node Studio/Cinema", component: SpaceCinemaPreview, parameters: { layout: "fullscreen" }, args: { media: "image", connected: true, readonly: false, running: false } } satisfies Meta<typeof SpaceCinemaPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ConnectedImage: Story = {};
export const ConnectedVideo: Story = { args: { media: "video" } };
export const UnconnectedImage: Story = { args: { connected: false } };
export const Readonly: Story = { args: { readonly: true } };
export const Running: Story = { args: { running: true } };
