import { useEffect, useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient } from "@tanstack/react-query";
import { AppToaster } from "@/shared/ui/app-toast";
import { nodeExecutionKeys } from "../hook/use-node-executions";
import type { NodeExecutionDto } from "../model/node-execution-types";
import type { RuntimeLlmModel } from "@/shared/model-catalog/runtime-utils";
import { createSpaceEditorSession } from "../model/space-editor-store";
import type { SpaceEditorDocument } from "../model/space-editor-types";
import type { SpaceInputRuntime } from "../model/space-editor-inputs";
import { SpaceEditor } from "./space-editor";
import { NativeStoryProviders, useStoryDocument } from "./native-story-fixtures";

const model: RuntimeLlmModel = { type: "llm", key: "creative", label: "Creative LLM", vendor: "OpenAI", provider: "openai_compatible",
  providerConfig: { base_url: "https://example.com/v1", model_id: "creative", supports_images: true }, isActive: true, isDefault: false };
const graphId = "assistant-preview";
const original: SpaceEditorDocument = { title: "Assistant list", schemaVersion: 3, groups: [],
  nodes: [
    { id: "assistant", kind: "generate.assistant", configVersion: 1, config: { prompt: "Propose three creative directions", modelKey: model.key, outputMode: "list" }, position: { x: 80, y: 80 }, selectedOutputAssetId: null },
    { id: "selected-item", kind: "input.prompt", configVersion: 1, config: { text: "Local fallback" }, position: { x: 660, y: 80 }, selectedOutputAssetId: null },
    { id: "full-text", kind: "input.prompt", configVersion: 1, config: { text: "Local fallback" }, position: { x: 660, y: 400 }, selectedOutputAssetId: null },
  ], edges: [
    { id: "item-edge", sourceNodeId: "assistant", sourcePortId: "item", targetNodeId: "selected-item", targetPortId: "text", sortOrder: 0 },
    { id: "text-edge", sourceNodeId: "assistant", sourcePortId: "text", targetNodeId: "full-text", targetPortId: "text", sortOrder: 0 },
  ] };
const execution: NodeExecutionDto = { executionId: "list-run", executionKind: "assistant", mediaType: "text", graphNodeId: "assistant", status: "completed", progress: 100,
  errorCode: null, modelKey: model.key, outputAssetIds: [], createdAt: "2026-10-01T00:00:00Z", outputMode: "list", outputText: "1. A warm portrait.\n\n2. A cinematic wide shot.\n\n3. A close study of fabric.",
  outputItems: [{ id: "list-run:1", text: "A warm portrait." }, { id: "list-run:2", text: "A cinematic wide shot." }, { id: "list-run:3", text: "A close study of fabric." }], selectedItemId: "list-run:1", selectionVersion: 0 };

function Preview() {
  const [client] = useState(() => {
    const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } } });
    client.setQueryData(nodeExecutionKeys.list(graphId, "assistant"), [execution]);
    return client;
  });
  const [session] = useState(() => {
    const value = createSpaceEditorSession({ id: graphId, version: 1, document: structuredClone(original) });
    value.patchRuntime("assistant", { execution });
    return value;
  });
  const graph = useStoryDocument(session);
  const [current, setCurrent] = useState(execution);
  useEffect(() => client.getQueryCache().subscribe(() => {
    const next = client.getQueryData<NodeExecutionDto[]>(nodeExecutionKeys.list(graphId, "assistant"))?.[0];
    if (next) { setCurrent(next); session.patchRuntime("assistant", { execution: next }); }
  }), [client, session]);
  useEffect(() => {
    const previous = window.fetch;
    window.fetch = async (input, options) => {
      const url = String(input);
      if (url === `/api/generation-graphs/${graphId}/nodes/assistant/executions/list-run` && options?.method === "PATCH") {
        const body = JSON.parse(String(options.body));
        const current = client.getQueryData<NodeExecutionDto[]>(nodeExecutionKeys.list(graphId, "assistant"))![0];
        if (body.expectedSelectionVersion !== current.selectionVersion) return Response.json({ message: "ASSISTANT_SELECTION_CONFLICT" }, { status: 409 });
        if (!current.outputItems?.some(item => item.id === body.itemId)) return Response.json({ message: "ASSISTANT_ITEM_NOT_FOUND" }, { status: 400 });
        return Response.json({ execution: { ...current, selectedItemId: body.itemId, selectionVersion: (current.selectionVersion ?? 0) + 1 } });
      }
      return previous(input, options);
    };
    return () => { window.fetch = previous; };
  }, [client]);
  const inputRuntime = useMemo<SpaceInputRuntime>(() => ({ assistantResults: { assistant: { text: current.outputText ?? null,
    item: current.outputItems?.find(item => item.id === current.selectedItemId)?.text ?? null } } }), [current]);
  return <NativeStoryProviders client={client} graphId={graphId}><main className="relative h-screen min-w-0 bg-neutral-950 text-white">
    <SpaceEditor session={session} catalog={{ imageModels: [], llmModels: [model], isLoading: false, error: null, retry: () => undefined }} inputRuntime={inputRuntime} />
    <output hidden data-assistant-list-fixture>{JSON.stringify({ graph, selectedItemId: current.selectedItemId, selectionVersion: current.selectionVersion })}</output>
    <AppToaster />
  </main></NativeStoryProviders>;
}
const meta = { title: "Features/Node Studio/Assistant List", component: Preview, parameters: { layout: "fullscreen" } } satisfies Meta<typeof Preview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Canvas: Story = {};
