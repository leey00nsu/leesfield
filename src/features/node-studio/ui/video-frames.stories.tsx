import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import type { GenerationGraphSnapshotDto } from "../model/graph-types";
import type { NodeExecutionDto } from "../model/node-execution-types";
import { nodeExecutionKeys } from "../hook/use-node-executions";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import { NodeBananaStudio } from "./node-banana-studio";

const date = "2026-10-01T00:00:00Z";
const bindings = (old = false) => ["startFrame", "endFrame"].map((portId, index) => ({ portId, sortOrder: 0, assetId: `${old ? "old-" : ""}frame-${index}` }));
const assets: MediaAssetDto[] = [false, true].flatMap(old => bindings(old).map((binding, index) => ({
  id: binding.assetId, version: 1, type: "image", status: "completed", origin: "media_operation", mimeType: "image/png",
  bytes: "100", width: 160, height: 90, durationMs: null, sourceOperationId: old ? "old-run" : "current-run", createdAt: date, updatedAt: date,
  url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="${old ? (index ? "#225eaa" : "#aa5e22") : (index ? "#2255dd" : "#dd3333")}"/></svg>`)}`,
})));
const original: GenerationGraphSnapshotDto = { id: "frames-preview", title: "Frames", schemaVersion: 3, minimumWriterVersion: 3, version: 1, groups: [], edges: [], createdAt: date, updatedAt: date,
  nodes: [{ id: "frames", kind: "edit.video.extractFrames", configVersion: 1, config: { parameters: {} }, position: { x: 80, y: 80 }, selectedOutputAssetId: "frame-0" }],
  outputBindings: bindings().map(binding => ({ graphNodeId: "frames", ...binding })),
};
const history: NodeExecutionDto[] = [false, true].map(old => ({ executionId: old ? "old-run" : "current-run", executionKind: "media_operation", mediaType: "image", graphNodeId: "frames",
  status: "completed", progress: 100, errorCode: null, modelKey: null, outputAssetIds: bindings(old).map(binding => binding.assetId), outputBindings: bindings(old), createdAt: date }));
function Preview() {
  const [client] = useState(() => {
    const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } } });
    assets.forEach(asset => client.setQueryData(mediaAssetKeys.detail(asset.id), asset));
    client.setQueryData(nodeExecutionKeys.list(original.id, "frames"), history);
    return client;
  });
  const [graph, setGraph] = useState(original);
  const selected = graph.nodes[0].selectedOutputAssetId;
  const current = selected ? bindings(selected.startsWith("old-")) : [];
  useEffect(() => {
    const previous = window.fetch;
    window.fetch = async (input, options) => String(input).endsWith("/executions")
      ? Response.json({ executions: history }) : previous(input, options);
    return () => { window.fetch = previous; };
  }, []);
  return <QueryClientProvider client={client}><main className="flex h-screen min-w-0 flex-col bg-neutral-950 text-white">
    <NodeBananaStudio graph={graph} writable readOnlyReason={null} catalog={{ imageModels: [], isLoading: false, error: null, retry: () => undefined, mediaOutputs: { frames: current } }}
      resolveUpstreamNodeData={(_id, data) => ({ ...data, outputBindings: current,
        outputAssetsByPort: Object.fromEntries(current.map(binding => [binding.portId, assets.filter(asset => asset.id === binding.assetId)])) })}
      prepareImageNodeExecution={async () => 1} onRegenerateNode={async () => undefined} onDraftChange={draft => setGraph(value => ({ ...value, ...draft }))} />
  </main></QueryClientProvider>;
}
const meta = { title: "Features/Node Studio/Video Frames", component: Preview, parameters: { layout: "fullscreen" } } satisfies Meta<typeof Preview>;
export default meta;
export const Canvas: StoryObj<typeof meta> = {};
