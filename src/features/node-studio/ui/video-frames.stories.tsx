import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient } from "@tanstack/react-query";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import type { NodeExecutionDto } from "../model/node-execution-types";
import type { SpaceEditorDocument } from "../model/space-editor-types";
import type { SpaceInputRuntime } from "../model/space-editor-inputs";
import { createSpaceEditorSession } from "../model/space-editor-store";
import { nodeExecutionKeys } from "../hook/use-node-executions";
import { SpaceEditor } from "./space-editor";
import { NativeStoryProviders, storyDate, storyMediaAsset, useStoryDocument } from "./native-story-fixtures";

const graphId = "frames-preview";
const bindings = (old = false) => ["startFrame", "endFrame"].map((portId, index) => ({ portId, sortOrder: 0, assetId: `${old ? "old-" : ""}frame-${index}` }));
const assets: MediaAssetDto[] = [false, true].flatMap(old => bindings(old).map((binding, index) => ({
  id: binding.assetId, version: 1, type: "image", status: "completed", origin: "media_operation", mimeType: "image/svg+xml",
  bytes: null, width: 160, height: 90, durationMs: null, sourceOperationId: old ? "old-run" : "current-run", createdAt: storyDate, updatedAt: storyDate,
  url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="${old ? (index ? "#225eaa" : "#aa5e22") : (index ? "#2255dd" : "#dd3333")}"/></svg>`)}`,
})));
const history: NodeExecutionDto[] = [false, true].map(old => ({ executionId: old ? "old-run" : "current-run", executionKind: "media_operation", mediaType: "image", graphNodeId: "frames",
  status: "completed", progress: 100, errorCode: null, modelKey: null, outputAssetIds: bindings(old).map(binding => binding.assetId), outputBindings: bindings(old),
  createdAt: old ? "2026-10-19T00:00:00Z" : storyDate, finishedAt: old ? "2026-10-19T00:00:01Z" : "2026-10-20T00:00:01Z" }));
const original: SpaceEditorDocument = { title: "Frame port results", schemaVersion: 3, groups: [], nodes: [
  { id: "source", kind: "input.video", configVersion: 1, config: { assetId: "source-video" }, position: { x: 0, y: 0 }, selectedOutputAssetId: null },
  { id: "frames", kind: "edit.video.extractFrames", configVersion: 1, config: { parameters: {} }, position: { x: 430, y: 0 }, selectedOutputAssetId: "frame-0" },
  ...bindings().map((binding, index) => ({ id: binding.portId + "-result", kind: "input.image", configVersion: 1,
    config: { assetId: binding.assetId, resultSource: { nodeId: "frames", portId: binding.portId, index: 0, executionId: "current-run", state: "completed" },
      presentation: { customTitle: binding.portId } }, position: { x: 1000, y: index * 360 }, selectedOutputAssetId: null })),
  ...bindings().map((binding, index) => ({ id: binding.portId + "-output", kind: "output.single", configVersion: 1, config: { mediaType: "image" },
    position: { x: 1400, y: index * 360 }, selectedOutputAssetId: null })),
], edges: [
  { id: "source-video-edge", sourceNodeId: "source", sourcePortId: "video", targetNodeId: "frames", targetPortId: "video", sortOrder: 0 },
  ...bindings().flatMap(binding => [
    { id: binding.portId + "-result-edge", sourceNodeId: "frames", sourcePortId: binding.portId, targetNodeId: binding.portId + "-result", targetPortId: "reference", sortOrder: 0 },
    { id: binding.portId + "-output-edge", sourceNodeId: "frames", sourcePortId: binding.portId, targetNodeId: binding.portId + "-output", targetPortId: "image", sortOrder: 0 },
  ]),
] };
function Preview() {
  const [client] = useState(() => {
    const value = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    [...assets, storyMediaAsset("source-video", "video")].forEach(asset => value.setQueryData(mediaAssetKeys.detail(asset.id), asset));
    value.setQueryData(nodeExecutionKeys.list(graphId, "frames"), history);
    return value;
  });
  const [session] = useState(() => {
    const value = createSpaceEditorSession({ id: graphId, version: 1, document: structuredClone(original) });
    value.patchRuntime("frames", { execution: history[0] });
    return value;
  });
  const graph = useStoryDocument(session);
  const old = graph.nodes.find(node => node.id === "frames")?.selectedOutputAssetId?.startsWith("old-") ?? false;
  const inputRuntime = useMemo<SpaceInputRuntime>(() => ({ mediaOutputs: new Map([["frames", bindings(old)]]) }), [old]);
  return <NativeStoryProviders client={client} graphId={graphId}><main className="relative h-screen min-w-0 bg-neutral-950 text-white">
    <SpaceEditor session={session} inputRuntime={inputRuntime} />
    <label className="absolute left-4 top-4 z-[100] rounded bg-neutral-800 p-2 text-sm">프레임 실행 기록 (스토리)
      <select aria-label="프레임 실행 기록 (스토리)" value={old ? "old" : "current"} onChange={event => {
        session.dispatch({ type: "output.select", nodeId: "frames", assetId: event.target.value === "old" ? "old-frame-0" : "frame-0" });
      }}><option value="current">현재 실행</option><option value="old">이전 실행</option></select>
    </label>
    <output hidden data-frame-port-results>{JSON.stringify({ graph, bindings: [...(inputRuntime.mediaOutputs ?? [])] })}</output>
  </main></NativeStoryProviders>;
}
const meta = { title: "Features/Node Studio/Video Frames", component: Preview, parameters: { layout: "fullscreen" } } satisfies Meta<typeof Preview>;
export default meta;
export const Canvas: StoryObj<typeof meta> = {};
