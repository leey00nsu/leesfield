import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppToaster } from "@/shared/ui/app-toast";
import { nodeExecutionKeys } from "../hook/use-node-executions";
import type { NodeExecutionDto } from "../model/node-execution-types";
import type { RuntimeLlmModel } from "@/shared/model-catalog/runtime-utils";
import type { GenerationGraphSnapshotDto } from "../model/graph-types";
import { NodeBananaStudio } from "./node-banana-studio";

const model: RuntimeLlmModel = { type: "llm", key: "creative", label: "Creative LLM", vendor: "OpenAI", provider: "openai_compatible",
  providerConfig: { base_url: "https://example.com/v1", model_id: "creative", supports_images: true }, isActive: true, isDefault: false };
const original: GenerationGraphSnapshotDto = { id: "assistant-preview", title: "Assistant list", version: 1, schemaVersion: 3, minimumWriterVersion: 3,
  nodes: [{ id: "assistant", kind: "generate.assistant", configVersion: 1, config: { prompt: "Propose three creative directions", modelKey: model.key, outputMode: "list" }, position: { x: 80, y: 80 }, selectedOutputAssetId: null }],
  edges: [], groups: [], createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
const execution: NodeExecutionDto = { executionId: "list-run", executionKind: "assistant", mediaType: "text", graphNodeId: "assistant", status: "completed", progress: 100,
  errorCode: null, modelKey: model.key, outputAssetIds: [], createdAt: "2026-10-01T00:00:00Z", outputMode: "list", outputText: "1. A warm portrait.\n\n2. A cinematic wide shot.\n\n3. A close study of fabric.",
  outputItems: [{ id: "list-run:1", text: "A warm portrait." }, { id: "list-run:2", text: "A cinematic wide shot." }, { id: "list-run:3", text: "A close study of fabric." }], selectedItemId: "list-run:1", selectionVersion: 0 };

function Preview() {
  const [client] = useState(() => {
    const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } } });
    client.setQueryData(nodeExecutionKeys.list(original.id, "assistant"), [execution]);
    return client;
  });
  const [graph, setGraph] = useState(original);
  const [selected, setSelected] = useState(execution.selectedItemId);
  useEffect(() => {
    const previous = window.fetch;
    window.fetch = async (input, options) => {
      const url = String(input);
      if (url.endsWith("/executions/list-run") && options?.method === "PATCH") {
        const body = JSON.parse(String(options.body));
        const current = client.getQueryData<NodeExecutionDto[]>(nodeExecutionKeys.list(original.id, "assistant"))![0];
        if (body.expectedSelectionVersion !== current.selectionVersion) return Response.json({ message: "ASSISTANT_SELECTION_CONFLICT" }, { status: 409 });
        setSelected(body.itemId);
        return Response.json({ execution: { ...current, selectedItemId: body.itemId, selectionVersion: (current.selectionVersion ?? 0) + 1 } });
      }
      if (url.endsWith("/executions")) return Response.json({ executions: client.getQueryData(nodeExecutionKeys.list(original.id, "assistant")) });
      if (url.includes("/preferences")) return Response.json({ preferences: { recentModelKeys: [] } });
      return previous(input, options);
    };
    return () => { window.fetch = previous; };
  }, [client]);
  return <QueryClientProvider client={client}><main className="flex h-screen min-w-0 flex-col bg-neutral-950 text-white">
    <NodeBananaStudio graph={graph} writable readOnlyReason={null} catalog={{ imageModels: [], llmModels: [model], isLoading: false, error: null, retry: () => undefined,
      assistantResults: { assistant: { text: execution.outputText!, item: execution.outputItems!.find(item => item.id === selected)?.text ?? null } } }}
      prepareImageNodeExecution={async () => 1} onRegenerateNode={async () => undefined}
      onDraftChange={draft => setGraph(current => ({ ...current, ...draft }))} />
    <AppToaster />
  </main></QueryClientProvider>;
}
const meta = { title: "Features/Node Studio/Assistant List", component: Preview, parameters: { layout: "fullscreen" } } satisfies Meta<typeof Preview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Canvas: Story = {};
