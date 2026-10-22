import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import type { BrowserMediaOperationPlan } from "../model/node-execution-types";
import { processSpaceImageResize } from "../lib/image-resize-processor";
import { spaceFilmstripScheduler } from "../lib/space-filmstrip";
import { VideoTrimEditor } from "./nodes/video-trim-editor";
import { createSpaceEditorSession } from "../model/space-editor-store";
import type { SpaceEditorDocument } from "../model/space-editor-types";
import { SpaceEditor } from "./space-editor";
import { nodeExecutionKeys } from "../hook/use-node-executions";

const video: MediaAssetDto = { id: "native-filmstrip", version: 1, type: "video", status: "completed", origin: "upload", mimeType: "video/mp4", bytes: null, width: 640, height: 360, durationMs: 5000, sourceOperationId: null, url: "/assets/storybook/puppy.mp4", createdAt: "2026-10-20", updatedAt: "2026-10-20" };
async function resizeProbe() {
  const rows = [];
  const cases: Array<[string, Record<string, unknown>, number, number, string]> = [
    ["contain", { mode: "exact", width: 80, height: 80, fit: "contain", padColor: "#00ff00", format: "png" }, 80, 80, "image/png"],
    ["cover", { mode: "exact", width: 80, height: 80, fit: "cover", format: "jpeg", quality: 0.85 }, 80, 80, "image/jpeg"],
    ["stretch", { mode: "exact", width: 80, height: 40, fit: "stretch", format: "webp", quality: 0.8 }, 80, 40, "image/webp"],
    ["maxEdge", { mode: "maxEdge", maxEdge: 160, fit: "contain", format: "keep" }, 160, 116, "image/jpeg"],
    ["scale", { mode: "scale", scalePct: 50, fit: "contain", format: "png" }, 320, 231, "image/png"],
  ];
  const response = await fetch("/assets/storybook/puppy.jpg"), source = await response.blob();
  for (const [name, parameters, width, height, mimeType] of cases) {
    const plan: BrowserMediaOperationPlan = { kind: "edit.image.resize", parameters, expectedOutputCount: 1, outputPortId: "image", outputMediaType: "image", inputs: [{ assetId: "fixture-image", portId: "image", sortOrder: 0, type: "image", mimeType: "image/jpeg", bytes: String(source.size), width: 640, height: 462, durationMs: null, url: "/assets/storybook/puppy.jpg" }] };
    const progress: number[] = [];
    const output = (await processSpaceImageResize({ plan, signal: new AbortController().signal, onProgress: value => progress.push(value) })).outputs[0];
    const decoded = await createImageBitmap(output.blob);
    try {
      if (decoded.width !== width || decoded.height !== height || output.blob.type !== mimeType) throw new Error(`Resize ${name}: decoded output mismatch ${decoded.width}x${decoded.height}`);
      let padding: number[] | undefined;
      if (name === "contain") {
        const canvas = document.createElement("canvas"); canvas.width = 80; canvas.height = 80;
        const context = canvas.getContext("2d")!; context.drawImage(decoded, 0, 0);
        padding = Array.from(context.getImageData(0, 0, 1, 1).data);
        if (padding[1] < 250 || padding[0] > 5 || padding[2] > 5) throw new Error("Resize contain: padding lost");
      }
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await output.blob.arrayBuffer())), value => value.toString(16).padStart(2, "0")).join("");
      rows.push({ name, width: decoded.width, height: decoded.height, mimeType: output.blob.type, bytes: output.blob.size, padding, hash, progress });
    } finally { decoded.close(); }
  }
  return rows;
}
function Fixture() {
  const [selected, setSelected] = useState(false), [mounted, setMounted] = useState(true), [parameters, setParameters] = useState({ startMs: 1000, endMs: 3000, stripAudio: false });
  const [probe, setProbe] = useState<unknown>(null), [stats, setStats] = useState(spaceFilmstripScheduler.stats());
  return <main className="min-h-screen bg-neutral-950 p-6 text-white">
    <div className="mb-4 flex gap-4">
      <button onClick={() => setSelected(value => !value)}>Toggle editing</button>
      <button onClick={() => setMounted(value => !value)}>Toggle editors</button>
      <button onClick={() => setStats(spaceFilmstripScheduler.stats())}>Read scheduler</button>
      <button onClick={() => void resizeProbe().then(setProbe, error => setProbe({ error: String(error) }))}>Probe Resize</button>
      <button onClick={() => { spaceFilmstripScheduler.clear(); setStats(spaceFilmstripScheduler.stats()); }}>Clear cache</button>
    </div>
    {mounted && <div className="grid max-w-[960px] grid-cols-2 gap-6">
      {[0, 1].map(index => <div key={index} data-filmstrip-editor={index}><VideoTrimEditor source={video} output={undefined} {...parameters} active={selected} writable externalResults onChange={patch => setParameters(value => ({ ...value, ...patch }))} /></div>)}
    </div>}
    <output data-resource-stats>{JSON.stringify(stats)}</output>
    <output data-resize-probe>{JSON.stringify(probe)}</output>
    <output data-trim-parameters>{JSON.stringify(parameters)}</output>
    {mounted && <div data-offscreen-editor style={{ width: 450, marginTop: 2000 }}><VideoTrimEditor source={{ ...video, id: "offscreen-filmstrip" }} output={undefined} {...parameters} active={selected} writable externalResults onChange={() => {}} /></div>}
  </main>;
}
const meta = { title: "Spaces/Native media processing", component: Fixture, parameters: { layout: "fullscreen" } } satisfies Meta<typeof Fixture>;
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
      node("resize", "edit.image.resize", 0, 0, { parameters: { width: 512, height: 256, quality: 0, format: "webp", fit: "contain" } }),
      node("frames", "edit.video.extractFrames", 460, 0, { parameters: {} }),
      node("stitch", "edit.video.stitch", 1000, 0, { parameters: { repeat: 2, stripAudio: false, clipOrder: ["clip-b", "clip-a"] } }, empty ? null : video.id),
      node("compare", "inspect.imageCompare", 1500, 0, {}),
      ...(!empty ? [node("image", "input.image", 0, 620, { assetId: "native-edit-image" }),
        node("clip-a", "input.video", 460, 620, { assetId: video.id }), node("clip-b", "input.video", 1000, 620, { assetId: video.id })] : []),
    ], edges: empty ? [] : [
      { id: "resize-source", sourceNodeId: "image", sourcePortId: "image", targetNodeId: "resize", targetPortId: "image", sortOrder: 0 },
      { id: "frames-source", sourceNodeId: "clip-a", sourcePortId: "video", targetNodeId: "frames", targetPortId: "video", sortOrder: 0 },
      { id: "clip-a", sourceNodeId: "clip-a", sourcePortId: "video", targetNodeId: "stitch", targetPortId: "clips", sortOrder: 0 },
      { id: "clip-b", sourceNodeId: "clip-b", sourcePortId: "video", targetNodeId: "stitch", targetPortId: "clips", sortOrder: 1 },
      { id: "compare-before", sourceNodeId: "image", sourcePortId: "image", targetNodeId: "compare", targetPortId: "before", sortOrder: 0 },
      { id: "compare-after", sourceNodeId: "image", sourcePortId: "image", targetNodeId: "compare", targetPortId: "after", sortOrder: 0 },
    ] };
    const value = createSpaceEditorSession({ id: "native-media-edit-surfaces", version: 1, writable: !readonly, document });
    value.select(["resize"]);
    return value;
  });
  return <QueryClientProvider client={cache}><div style={{ width: "100vw", height: "100vh" }}>
    <SpaceEditor session={session} />
  </div></QueryClientProvider>;
}

export const EditSurfaces: Story = { render: () => <EditSurfacesFixture /> };
export const EmptyEditSurfaces: Story = { render: () => <EditSurfacesFixture empty /> };
export const ReadonlyEditSurfaces: Story = { render: () => <EditSurfacesFixture readonly /> };
