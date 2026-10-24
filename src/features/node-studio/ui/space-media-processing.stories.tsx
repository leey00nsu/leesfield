import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { spaceFilmstripScheduler } from "../lib/space-filmstrip";
import { VideoFrameEditor } from "./nodes/video-frame-editor";
import { createSpaceEditorSession } from "../model/space-editor-store";
import type { SpaceEditorDocument } from "../model/space-editor-types";
import { SpaceEditor } from "./space-editor";
import { nodeExecutionKeys } from "../hook/use-node-executions";

const video: MediaAssetDto = { id: "native-filmstrip", version: 1, type: "video", status: "completed", origin: "upload", mimeType: "video/mp4", bytes: null, width: 640, height: 360, durationMs: 5000, sourceOperationId: null, url: "/assets/storybook/puppy.mp4", createdAt: "2026-10-20", updatedAt: "2026-10-20" };
function Fixture() {
  const [selected, setSelected] = useState(false), [mounted, setMounted] = useState(true), [timestampMs, setTimestamp] = useState(0);
  const [stats, setStats] = useState(spaceFilmstripScheduler.stats());
  return <main className="min-h-screen bg-neutral-950 p-6 text-white">
    <div className="mb-4 flex gap-4">
      <button onClick={() => setSelected(value => !value)}>Toggle editing</button>
      <button onClick={() => setMounted(value => !value)}>Toggle editors</button>
      <button onClick={() => setStats(spaceFilmstripScheduler.stats())}>Read scheduler</button>
      <button onClick={() => { spaceFilmstripScheduler.clear(); setStats(spaceFilmstripScheduler.stats()); }}>Clear cache</button>
    </div>
    {mounted && <div className="grid max-w-[960px] grid-cols-2 gap-6">
      {[0, 1].map(index => <div key={index} data-filmstrip-editor={index}><VideoFrameEditor source={video} active={selected} writable frame={{ timestampMs, onChange: setTimestamp }} /></div>)}
    </div>}
    <output data-resource-stats>{JSON.stringify(stats)}</output>
    <output data-frame-parameters>{JSON.stringify({timestampMs})}</output>
    {mounted && <div data-offscreen-editor style={{ width: 450, marginTop: 2000 }}><VideoFrameEditor source={{ ...video, id: "offscreen-filmstrip" }} active={selected} writable frame={{ timestampMs, onChange: () => {} }} /></div>}
  </main>;
}
const meta = { title: "Spaces/Native media processing", component: Fixture, parameters: { layout: "fullscreen", nextjs: { appDirectory: false } } } satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Resources: Story = {};

function EditSurfacesFixture({ empty = false, readonly = false }: { empty?: boolean; readonly?: boolean }) {
  const [cache] = useState(() => {
    const value = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } } });
    value.setQueryData(mediaAssetKeys.detail(video.id), video);
    value.setQueryData(mediaAssetKeys.detail("native-edit-image"), { ...video, id: "native-edit-image", type: "image", mimeType: "image/jpeg",
      width: 640, height: 462, durationMs: null, url: "/assets/storybook/puppy.jpg" } satisfies MediaAssetDto);
    for (const nodeId of ["resize", "frames", "stitch", "compare", "image", "clip-a", "clip-b"]) {
      value.setQueryData(nodeExecutionKeys.list("native-media-edit-surfaces", nodeId), []);
    }
    return value;
  });
  const [session] = useState(() => {
    const node = (id: string, kind: string, x: number, y: number, config: CanonicalNode["config"], selectedOutputAssetId: string | null = null): CanonicalNode => ({
      id, kind, configVersion: 1, config, position: { x, y }, selectedOutputAssetId,
    });
    const document: SpaceEditorDocument = { schemaVersion: 3, title: "Media surfaces and inspector", groups: [], nodes: [
      node("frames", "edit.video.extractFrames", 460, 0, { parameters: {} }),
      node("stitch", "edit.video.stitch", 1000, 0, { parameters: { repeat: 2, stripAudio: false, clipOrder: ["clip-b", "clip-a"] } }, empty ? null : video.id),
      node("compare", "inspect.imageCompare", 1500, 0, {}),
      ...(!empty ? [node("image", "input.image", 0, 620, { assetId: "native-edit-image" }),
        node("clip-a", "input.video", 460, 620, { assetId: video.id }), node("clip-b", "input.video", 1000, 620, { assetId: video.id })] : []),
    ], edges: empty ? [] : [
      { id: "frames-source", sourceNodeId: "clip-a", sourcePortId: "video", targetNodeId: "frames", targetPortId: "video", sortOrder: 0 },
      { id: "clip-a", sourceNodeId: "clip-a", sourcePortId: "video", targetNodeId: "stitch", targetPortId: "clips", sortOrder: 0 },
      { id: "clip-b", sourceNodeId: "clip-b", sourcePortId: "video", targetNodeId: "stitch", targetPortId: "clips", sortOrder: 1 },
      { id: "compare-before", sourceNodeId: "image", sourcePortId: "image", targetNodeId: "compare", targetPortId: "before", sortOrder: 0 },
      { id: "compare-after", sourceNodeId: "image", sourcePortId: "image", targetNodeId: "compare", targetPortId: "after", sortOrder: 0 },
    ] };
    const value = createSpaceEditorSession({ id: "native-media-edit-surfaces", version: 1, writable: !readonly, document });
    value.select(["frames"]);
    return value;
  });
  return <QueryClientProvider client={cache}><div style={{ width: "100vw", height: "100vh" }}>
    <SpaceEditor session={session} />
  </div></QueryClientProvider>;
}

export const EditSurfaces: Story = { render: () => <EditSurfacesFixture /> };
export const EmptyEditSurfaces: Story = { render: () => <EditSurfacesFixture empty /> };
export const ReadonlyEditSurfaces: Story = { render: () => <EditSurfacesFixture readonly /> };
