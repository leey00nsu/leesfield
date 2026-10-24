import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { MediaCropEditor, type CropEdit } from "./media-crop-editor";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import { createSpaceEditorSession } from "../../model/space-editor-store";
import { SpaceEditor } from "../space-editor";
import { useReactFlow } from "@xyflow/react";
import { MediaTrimEditor, type TrimEdit } from "./media-trim-editor";
const image: MediaAssetDto = { id: "crop-image", version: 1, type: "image", status: "completed", origin: "upload", mimeType: "image/jpeg", bytes: null,
  width: 640, height: 462, durationMs: null, sourceOperationId: null, url: "/assets/storybook/puppy.jpg", createdAt: "2026-10-23", updatedAt: "2026-10-23" };
function CropFixture({ video = false }) {
  const asset = video ? { ...image, id: "crop-video", type: "video" as const, width: 640, height: 360, durationMs: 5000, mimeType: "video/mp4", url: "/assets/storybook/puppy.mp4" } : image;
  const [edit, set] = useState<CropEdit>({ kind: video ? "video.crop" : "image.crop",
    rect: video ? { x: 64, y: 36, width: 512, height: 288 } : { x: 0, y: 0, width: 640, height: 462 } });
  const [preset, setPreset] = useState("original"), [status, setStatus] = useState("editing");
  return <main style={{ height: "100vh", display: "grid", placeItems: "center", background: "#101010" }}>
    <div style={{ position: "relative", width: "min(640px, calc(100vw - 48px))", aspectRatio: asset.width! / asset.height! }}>
      <MediaCropEditor asset={asset} edit={edit} preset={preset} onChange={(value, name = "custom") => { set(value); setPreset(name); }}
        onCancel={() => setStatus("cancelled")} onConfirm={() => setStatus("confirmed")}
        barStyle={{ left: "50%", transform: "translateX(-50%)", width: video ? 270 : 250, ...(video ? { top: "calc(100% + 12px)" } : { bottom: "calc(100% + 12px)" }) }} />
    </div><output data-edit-fixture style={{ position: "fixed", left: 8, bottom: 8, fontSize: 11 }}>{JSON.stringify({ status, edit, preset })}</output>
  </main>;
}
const meta = { title: "Spaces/Direct media edit", component: CropFixture, parameters: { layout: "fullscreen", nextjs: { appDirectory: false } } } satisfies Meta<typeof CropFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ImageCrop: Story = {};
export const VideoCrop: Story = { args: { video: true } };

function CanvasFixture() {
  const [cache] = useState(() => {
    const cache = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    cache.setQueryData(mediaAssetKeys.detail(image.id), image);
    cache.setQueryData(mediaAssetKeys.detail("crop-video"), { ...image, id: "crop-video", type: "video", mimeType: "video/mp4", width: 640, height: 360, durationMs: 5000, url: "/assets/storybook/puppy.mp4" });
    return cache;
  });
  const [session] = useState(() => createSpaceEditorSession({ id: "direct-edit-fixture", version: 1, document: {
    schemaVersion: 3, title: "Direct media edit", groups: [], edges: [], nodes: [
      { id: "image", kind: "input.image", configVersion: 1, position: { x: 0, y: 0 }, config: { assetId: image.id }, selectedOutputAssetId: null },
      { id: "video", kind: "input.video", configVersion: 1, position: { x: 500, y: 0 }, config: { assetId: "crop-video" }, selectedOutputAssetId: null },
    ],
  } }));
  const [graph, setGraph] = useState(session.getDocument());
  useEffect(() => session.subscribeDurable(event => setGraph(event.document)), [session]);
  return <QueryClientProvider client={cache}><div style={{ width: "100vw", height: "100vh" }}>
    <SpaceEditor session={session} services={{ prepareNodeExecution: async () => 1 }}><FixtureZoom /></SpaceEditor>
    <output data-edit-graph hidden>{JSON.stringify(graph)}</output>
  </div></QueryClientProvider>;
}
export const Canvas: Story = { render: () => <CanvasFixture /> };
function TrimFixture() {
  const [edit, set] = useState<TrimEdit>({ kind: "video.trim", startMs: 0, endMs: 1667 }), [status, setStatus] = useState("editing");
  const [asset] = useState(() => ({ ...image, id: "crop-video", type: "video" as const, mimeType: "video/mp4", width: 640, height: 360, durationMs: 5000, url: "/assets/storybook/puppy.mp4" }));
  return <main style={{ width: "100vw", height: "100vh", background: "#101010" }}>
    <MediaTrimEditor asset={asset} edit={edit} onChange={set} onCancel={() => setStatus("cancelled")} onConfirm={() => setStatus("confirmed")}
      stageStyle={{ position: "absolute", left: "50%", top: 150, transform: "translateX(-50%)", width: "min(640px, calc(100vw - 32px))", aspectRatio: "16/9" }}
      barStyle={{ position: "absolute", left: "50%", top: 540, transform: "translateX(-50%)", width: "min(959px, calc(100vw - 16px))" }} />
    <output data-trim-fixture style={{ position: "fixed", left: 8, bottom: 8, fontSize: 11 }}>{JSON.stringify({ status, edit })}</output>
  </main>;
}
export const VideoTrim: Story = { render: () => <TrimFixture /> };
function FixtureZoom() {
  const flow = useReactFlow();
  return <div className="nodrag nopan" style={{ position: "fixed", left: 8, top: 8, zIndex: 10 }}>
    {[false, true].map(video => <div key={String(video)}>{[0.5, 1, 1.5].map(zoom => <button key={zoom} style={{ margin: 6 }} onClick={() => {
      void flow.setViewport({ x: window.innerWidth / 2 - (video ? 650 : 175) * zoom, y: 360 - 126 * zoom, zoom });
    }}>{video ? "Video fixture" : "Fixture"} {zoom * 100}%</button>)}</div>)}
  </div>;
}
