import { useEffect, useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import { createSpaceEditorSession } from "../model/space-editor-store";
import type { SpaceEditorDocument } from "../model/space-editor-types";
import { SpaceCanvas } from "./space-canvas";
import { SpaceEditorProvider, useSpaceEditor, useSpaceSelector } from "./space-editor-provider";
import { SpaceNodeFrame } from "./nodes/space-node-frame";
import { SpaceEditor } from "./space-editor";

const initial: SpaceEditorDocument = { schemaVersion: 3, title: "Native editor controls", groups: [], edges: [], nodes: [
  { id: "prompt", kind: "input.prompt", position: { x: 0, y: 0 }, configVersion: 1, config: { text: "First prompt" }, selectedOutputAssetId: null },
  { id: "target", kind: "input.prompt", position: { x: 500, y: 0 }, configVersion: 1, config: { text: "Second prompt" }, selectedOutputAssetId: null },
  { id: "memo", kind: "note.memo", position: { x: 250, y: 350 }, configVersion: 1, config: { text: "Native canvas fixture" }, selectedOutputAssetId: null },
] };
function FixtureNode({ nodeId }: { nodeId: string }) {
  const { session } = useSpaceEditor(), node = useSpaceSelector(state => state.nodeById.get(nodeId));
  const config = node?.config && typeof node.config === "object" && !Array.isArray(node.config) ? node.config : {};
  return <SpaceNodeFrame nodeId={nodeId}><div style={{ padding: 16, height: "100%" }}>
    <textarea aria-label={"Fixture text " + nodeId} className="nodrag nopan nowheel" value={typeof config.text === "string" ? config.text : ""}
      style={{ resize: "none", width: "100%", height: "100%", background: "transparent", fontSize: 14, outline: "none" }}
      onChange={event => session.dispatch({ type: "node.config.patch", nodeId, patch: { text: event.target.value } })} />
  </div></SpaceNodeFrame>;
}
function Fixture() {
  const [session] = useState(() => createSpaceEditorSession({ id: "native-fixture", version: 1, document: structuredClone(initial) }));
  const [saved, setSaved] = useState(0), [draft, setDraft] = useState(session.getDocument());
  useEffect(() => session.subscribeDurable(event => { setSaved(value => value + 1); setDraft(event.document); }), [session]);
  const services = useMemo(() => ({ renderNode: FixtureNode }), []);
  return <div style={{ width: "100vw", height: "100vh" }}><SpaceEditorProvider session={session} services={services}><SpaceCanvas />
    <output data-native-fixture="" className="nodrag nopan" style={{ position: "fixed", top: 12, left: 12, fontSize: 11, zIndex: 100, maxWidth: 500 }}>
      {JSON.stringify({ saved, nodes: draft.nodes.map(node => ({ id: node.id, x: node.position.x, y: node.position.y,
        size: node.kind === "note.memo" && node.config && typeof node.config === "object" && !Array.isArray(node.config) ? node.config.size : undefined })), edges: draft.edges.length, groups: draft.groups.length })}
    </output>
  </SpaceEditorProvider></div>;
}
const meta = { title: "Spaces/Native editor", component: Fixture, parameters: { layout: "fullscreen" } } satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Controls: Story = {};

const inputAssets: MediaAssetDto[] = ([
  ["image", "/assets/storybook/puppy.jpg", "image/jpeg", 640, 462, null],
  ["audio", "/assets/storybook/tone.wav", "audio/wav", null, null, 1000],
  ["video", "/assets/storybook/puppy.mp4", "video/mp4", 640, 360, 5000],
] as const).map(([type, url, mimeType, width, height, durationMs]) => ({ id: "native-fixture-" + type, version: 1, type, status: "completed", origin: "upload",
  mimeType, width, height, durationMs, bytes: null, sourceOperationId: null, url, createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z" }));
const inputDocument: SpaceEditorDocument = { schemaVersion: 3, title: "Native inputs", groups: [], edges: [], nodes: [
  { id: "memo", kind: "note.memo", configVersion: 1, position: { x: 0, y: 0 }, config: { text: "작업 메모" }, selectedOutputAssetId: null },
  { id: "prompt", kind: "input.prompt", configVersion: 1, position: { x: 400, y: 0 }, config: { text: "레몬 비타민", variableName: "product" }, selectedOutputAssetId: null },
  { id: "constructor", kind: "process.promptConstructor", configVersion: 1, position: { x: 800, y: 0 }, config: { template: "@product 데스크 광고" }, selectedOutputAssetId: null },
  ...inputAssets.map((asset, index) => ({ id: asset.type, kind: `input.${asset.type}` as "input.image" | "input.audio" | "input.video", configVersion: 1,
    position: { x: index * 400, y: 400 }, config: { assetId: asset.id }, selectedOutputAssetId: null })),
] };
inputDocument.edges.push({ id: "prompt-constructor", sourceNodeId: "prompt", sourcePortId: "text", targetNodeId: "constructor", targetPortId: "text", sortOrder: 0 });
function InputFixture() {
  const [cache] = useState(() => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    for (const asset of inputAssets) client.setQueryData(mediaAssetKeys.detail(asset.id), asset);
    return client;
  });
  const [session] = useState(() => createSpaceEditorSession({ id: "native-input-fixture", version: 1, document: structuredClone(inputDocument) }));
  const [draft, setDraft] = useState(session.getDocument());
  useEffect(() => session.subscribeDurable(event => setDraft(event.document)), [session]);
  return <QueryClientProvider client={cache}><div style={{ width: "100vw", height: "100vh" }}><SpaceEditor session={session} />
    <output data-native-input-fixture="" hidden>{JSON.stringify(draft)}</output>
  </div></QueryClientProvider>;
}
export const Inputs: Story = { render: () => <InputFixture /> };

function MemoSettingsFixture() {
  const [cache] = useState(() => new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } }));
  const [session] = useState(() => {
    const value = createSpaceEditorSession({ id: 'native-memo-settings', version: 1, document: { schemaVersion: 3,
      title: 'Memo and prompt controls', groups: [], edges: [], nodes: [
        { id: 'memo', kind: 'note.memo', configVersion: 1, position: { x: 0, y: 0 }, config: { text: '촬영 메모', backgroundColor: '#f2d86b' }, selectedOutputAssetId: null },
        { id: 'prompt', kind: 'input.prompt', configVersion: 1, position: { x: 440, y: 0 }, config: { text: '자연광이 드는 책상 위의 제품', variableName: 'scene' }, selectedOutputAssetId: null },
      ] } });
    value.select(['memo']); return value;
  });
  return <QueryClientProvider client={cache}><div style={{ width: '100vw', height: '100vh' }}><SpaceEditor session={session} /></div></QueryClientProvider>;
}
export const MemoSettings: Story = { render: () => <MemoSettingsFixture /> };
