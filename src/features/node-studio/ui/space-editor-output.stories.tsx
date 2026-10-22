import { useEffect, useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import { canonicalNodeKinds } from "@/shared/generation-graph/node-registry";
import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import { createSpaceEditorSession } from "../model/space-editor-store";
import type { SpaceEditorDocument } from "../model/space-editor-types";
import { nodeExecutionKeys } from "../hook/use-node-executions";
import { SpaceEditor } from "./space-editor";

const assets = ([
  ["image-a", "image", "/assets/storybook/puppy.jpg", "image/jpeg", 640, 462, null],
  ["image-b", "image", "/assets/storybook/puppy.jpg?second", "image/jpeg", 640, 462, null],
  ["video", "video", "/assets/storybook/puppy.mp4", "video/mp4", 640, 360, 5000],
  ["audio", "audio", "/assets/storybook/tone.wav", "audio/wav", null, null, 1000],
] as const).map(([id, type, url, mimeType, width, height, durationMs]) => ({ id: "output-" + id, version: 1, type, url, mimeType, width, height, durationMs,
  status: "completed" as const, origin: "upload" as const, bytes: null, sourceOperationId: null, createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z" }));
const node = (id: string, kind: string, x: number, y: number, config?: CanonicalNode["config"], assetId: string | null = null): CanonicalNode => ({
  id, kind, configVersion: 1, position: { x, y }, config: config ?? defaultConfigForKind(kind as typeof canonicalNodeKinds[number]), selectedOutputAssetId: assetId,
});
const outputDocument: SpaceEditorDocument = { schemaVersion: 3, title: "Native output", groups: [], nodes: [
  node("image-a", "input.image", 0, 0, { assetId: "output-image-a" }), node("image-b", "input.image", 0, 330, { assetId: "output-image-b" }),
  node("video", "input.video", 400, 0, { assetId: "output-video" }), node("audio", "input.audio", 400, 330, { assetId: "output-audio" }),
  node("output", "output.single", 800, 0, { mediaType: "image" }), node("gallery", "output.gallery", 800, 390), node("compare", "inspect.imageCompare", 1200, 0),
], edges: [
  { id: "out", sourceNodeId: "image-a", sourcePortId: "image", targetNodeId: "output", targetPortId: "image", sortOrder: 0 },
  { id: "compare-before", sourceNodeId: "image-a", sourcePortId: "image", targetNodeId: "compare", targetPortId: "before", sortOrder: 0 },
  { id: "compare-after", sourceNodeId: "image-b", sourcePortId: "image", targetNodeId: "compare", targetPortId: "after", sortOrder: 0 },
  ...["image-a", "image-a", "image-b", "video", "audio"].map((id, index) => ({ id: "gallery-" + index, sourceNodeId: id, sourcePortId: id.startsWith("image") ? "image" : id, targetNodeId: "gallery", targetPortId: id.startsWith("image") ? "image" : id, sortOrder: index })),
] };
const matrix: SpaceEditorDocument = { schemaVersion: 3, title: "All retained kinds", groups: [], edges: [], nodes: canonicalNodeKinds.map((kind, index) => node(kind, kind,
  (index % 6) * 480, Math.floor(index / 6) * 620, undefined,
  kind.startsWith("edit.") ? kind.startsWith("edit.video") && kind !== "edit.video.frameGrab" ? "output-video" : "output-image-a" : null)) };
function Fixture({ all = false, future = false }: { all?: boolean; future?: boolean }) {
  const id = future ? "native-future-fixture" : all ? "native-matrix-fixture" : "native-output-fixture";
  const document = future ? { ...matrix, nodes: [node("future", "generate.image", 0, 0, { payload: ["keep", 0, false, null] })].map(node => ({ ...node, configVersion: 99 })) } : all ? matrix : outputDocument;
  const [cache] = useState(() => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    for (const asset of assets) client.setQueryData(mediaAssetKeys.detail(asset.id), asset);
    for (const node of document.nodes) client.setQueryData(nodeExecutionKeys.list(id, node.id), []);
    return client;
  });
  const [session] = useState(() => createSpaceEditorSession({ id, version: 1, document: structuredClone(document) }));
  const [draft, setDraft] = useState(session.getDocument()), [error, setError] = useState<string | null>(null);
  useEffect(() => session.subscribeDurable(event => setDraft(event.document)), [session]);
  const services = useMemo(() => ({ onError: (error: Error) => setError(error.message), runNode: async () => { throw new Error("Fixture must not execute"); } }), []);
  return <QueryClientProvider client={cache}><div style={{ width: "100vw", height: "100vh" }}><SpaceEditor session={session} services={services} />
    <output hidden data-native-output-fixture>{JSON.stringify({ draft, error, writable: session.getSnapshot().writable })}</output>
  </div></QueryClientProvider>;
}
const meta = { title: "Spaces/Native output", component: Fixture, parameters: { layout: "fullscreen" } } satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Outputs: Story = {};
export const AllKinds: Story = { args: { all: true } };
export const Future: Story = { args: { future: true } };
