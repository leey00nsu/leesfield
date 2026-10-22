import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient } from "@tanstack/react-query";
import { defaultCinemaSettings } from "@/shared/cinema/cinema-contract";
import { runtimeImageModelsFixture, runtimeVideoModelsFixture } from "@/test-utils/fixtures/runtime-model-catalog";
import { projectGenerationModelSelectionDefaults } from "../model/generation-model-selection-defaults";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { createSpaceEditorSession } from "../model/space-editor-store";
import type { SpaceEditorDocument } from "../model/space-editor-types";
import { SpaceEditor } from "./space-editor";
import { NativeStoryProviders, storyDate, useStoryDocument } from "./native-story-fixtures";
import { nodeExecutionKeys } from "../hook/use-node-executions";

type CinemaArgs = { media?: "image" | "video"; connected?: boolean; readonly?: boolean; running?: boolean };
function SpaceCinemaPreview({ media = "image", connected = true, readonly = false, running = false }: CinemaArgs) {
  return <CinemaCanvas key={[media, connected, readonly, running].join(":")} media={media} connected={connected} readonly={readonly} running={running} />;
}
function CinemaCanvas({ media = "image", connected = true, readonly = false, running = false }: CinemaArgs) {
  const [client] = useState(() => {
    const value = new QueryClient({ defaultOptions: { queries: { enabled: false, staleTime: Infinity, retry: false } } });
    value.setQueryData(["prompt-presets", media, false], []);
    return value;
  });
  const [session] = useState(() => {
    const model = media === "image" ? runtimeImageModelsFixture[0] : runtimeVideoModelsFixture[0];
    const config = projectGenerationModelSelectionDefaults({}, { prompt: "A quiet street at dusk", modelKey: model.key, parameters: {},
      cinema: { ...defaultCinemaSettings(), camera: "16mm-film", lens: "modern-prime", composition: "medium", aperture: "f14", lighting: "window" } }, [model]);
    const document: SpaceEditorDocument = { title: "Cinema Studio", schemaVersion: 3, groups: [],
      nodes: [
        ...(connected ? [{ id: "source", kind: "input.prompt", configVersion: 1, config: { text: "A woman walking across an old city square" }, position: { x: 30, y: 100 }, selectedOutputAssetId: null }] : []),
        { id: "cinema", kind: `generate.${media}`, configVersion: 1, config: config as CanonicalJsonValue, position: { x: connected ? 540 : 80, y: 80 }, selectedOutputAssetId: null },
      ], edges: connected ? [{ id: "prompt-edge", sourceNodeId: "source", sourcePortId: "text", targetNodeId: "cinema", targetPortId: "prompt", sortOrder: 0 }] : [] };
    const value = createSpaceEditorSession({ id: "cinema-space", version: 1, document, writable: !readonly, readOnlyReason: readonly ? "READ_ONLY" : null });
    const execution = running ? { executionId: "cinema-run", executionKind: "generation" as const, mediaType: media, graphNodeId: "cinema",
      modelKey: model.key, status: "processing" as const, progress: 12, errorCode: null, outputAssetIds: [], createdAt: storyDate } : undefined;
    client.setQueryData(nodeExecutionKeys.list("cinema-space", "cinema"), execution ? [execution] : []);
    if (execution) value.patchRuntime("cinema", { execution, ...(media === "image" ? { repeatProgress: { completed: 0, failed: 0, total: 1, running: true } } : {}) });
    value.select(["cinema"]);
    return value;
  });
  const graph = useStoryDocument(session);
  return <NativeStoryProviders client={client} graphId="cinema-space" inlineParametersEnabled><main className="fixed inset-0 bg-neutral-900">
    <SpaceEditor session={session} catalog={{ imageModels: runtimeImageModelsFixture, videoModels: runtimeVideoModelsFixture, isLoading: false, error: null, retry: () => undefined }} />
    <output className="sr-only" aria-label="Cinema canonical config">{JSON.stringify(graph.nodes.find(node => node.id === "cinema")?.config)}</output>
  </main></NativeStoryProviders>;
}
const meta = { title: "Features/Node Studio/Cinema", component: SpaceCinemaPreview, parameters: { layout: "fullscreen" }, args: { media: "image", connected: true, readonly: false, running: false } } satisfies Meta<typeof SpaceCinemaPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ConnectedImage: Story = {};
export const ConnectedVideo: Story = { args: { media: "video" } };
export const UnconnectedImage: Story = { args: { connected: false } };
export const Readonly: Story = { args: { readonly: true } };
export const Running: Story = { args: { running: true } };
