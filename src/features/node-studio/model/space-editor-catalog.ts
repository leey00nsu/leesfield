import { isUnavailableEditNodeKind } from "@/shared/generation-graph/node-availability";
import {
  canonicalNodeKinds,
  findNodeDefinition,
  type CanonicalNodeKind,
  type PortDefinition,
} from "@/shared/generation-graph/node-registry";

import type { SpaceNodeCatalogItem } from "./space-editor-types";

/** Product labels and footprints, including retained nodes in existing Spaces. */
export const spaceNodeCatalog = {
  "note.memo": {
    title: "Memo", paletteLabel: "Memo", category: "Process", mediaType: "text",
    geometry: { width: 300, height: 220, minWidth: 220, minHeight: 140 },
  },
  "input.image": {
    title: "Image Input", paletteLabel: "Image Input", category: "Input", mediaType: "image",
    geometry: { width: 300, height: 300, minWidth: 180, minHeight: 100 }, supportsOptionalInput: true,
  },
  "input.audio": {
    title: "Audio Input", paletteLabel: "Audio Input", category: "Input", mediaType: "audio",
    geometry: { width: 300, height: 300, minWidth: 180, minHeight: 100 }, supportsOptionalInput: true,
  },
  "input.video": {
    title: "Video Input", paletteLabel: "Video Input", category: "Input", mediaType: "video",
    geometry: { width: 300, height: 300, minWidth: 180, minHeight: 100 }, supportsOptionalInput: true,
  },
  "input.prompt": {
    title: "Prompt", paletteLabel: "Prompt", category: "Text", mediaType: "text",
    geometry: { width: 320, height: 220, minWidth: 180, minHeight: 100 }, supportsOptionalInput: true,
  },
  "process.promptConstructor": {
    title: "Prompt Constructor", paletteLabel: "Prompt Constructor", category: "Text", mediaType: "text",
    geometry: { width: 340, height: 280, minWidth: 180, minHeight: 100 },
  },
  "generate.image": {
    title: "Generate Image", paletteLabel: "Generate Image", category: "Generate", mediaType: "image",
    geometry: { width: 400, height: 360, minWidth: 180, minHeight: 100 },
  },
  "generate.audio": {
    title: "Generate Audio", paletteLabel: "Generate Audio", category: "Generate", mediaType: "audio",
    geometry: { width: 300, height: 280, minWidth: 300, minHeight: 250 },
  },
  "generate.video": {
    title: "Generate Video", paletteLabel: "Generate Video", category: "Generate", mediaType: "video",
    geometry: { width: 400, height: 400, minWidth: 180, minHeight: 100 },
  },
  "generate.assistant": {
    title: "AI Assistant", paletteLabel: "AI Assistant", category: "Generate", mediaType: "text",
    geometry: { width: 420, height: 420, minWidth: 320, minHeight: 280 },
  },
  "edit.image.annotation": {
    title: "Annotation", paletteLabel: "Annotate", category: "Process", mediaType: "image",
    geometry: { width: 300, height: 280, minWidth: 180, minHeight: 100 },
  },
  "edit.image.resize": {
    title: "Image Resize", paletteLabel: "Image Resize", category: "Process", mediaType: "image",
    geometry: { width: 320, height: 320, minWidth: 180, minHeight: 180 },
  },
  "edit.image.removeBackground": {
    title: "Remove Background", paletteLabel: "Remove Background", category: "Process", mediaType: "image",
    geometry: { width: 320, height: 320, minWidth: 320, minHeight: 320 },
  },
  "edit.image.splitGrid": {
    title: "Split Grid", paletteLabel: "Split Grid", category: "Process", mediaType: "image",
    geometry: { width: 300, height: 400, minWidth: 260, minHeight: 340 },
  },
  "edit.image.gif": {
    title: "GIF Encoder", paletteLabel: "GIF Encoder", category: "Process", mediaType: "image",
    geometry: { width: 480, height: 380, minWidth: 460, minHeight: 340 },
  },
  "edit.video.stitch": {
    title: "Video Stitch", paletteLabel: "Video Stitch", category: "Process", mediaType: "video",
    geometry: { width: 400, height: 400, minWidth: 300, minHeight: 200 },
  },
  "edit.video.trim": {
    title: "Video Trim", paletteLabel: "Video Trim", category: "Process", mediaType: "video",
    geometry: { width: 420, height: 460, minWidth: 360, minHeight: 400 },
  },
  "edit.video.frameGrab": {
    title: "Frame Grab", paletteLabel: "Frame Grab", category: "Process", mediaType: "video",
    geometry: { width: 320, height: 320, minWidth: 320, minHeight: 320 },
  },
  "edit.video.extractFrames": {
    title: "Video Frames", paletteLabel: "Video Frames", category: "Process", mediaType: "video",
    geometry: { width: 420, height: 420, minWidth: 320, minHeight: 300 },
  },
  "edit.video.easeCurve": {
    title: "Ease Curve", paletteLabel: "Ease Curve", category: "Process", mediaType: "video",
    geometry: { width: 340, height: 280, minWidth: 340, minHeight: 100 },
  },
  "output.single": {
    title: "Output", paletteLabel: "Output", category: "Output", mediaType: "media",
    geometry: { width: 320, height: 320, minWidth: 200, minHeight: 100 },
  },
  "output.gallery": {
    title: "Output Gallery", paletteLabel: "Output Gallery", category: "Output", mediaType: "media",
    geometry: { width: 320, height: 360, minWidth: 200, minHeight: 100 },
  },
  "inspect.imageCompare": {
    title: "Image Compare", paletteLabel: "Image Compare", category: "Process", mediaType: "image",
    geometry: { width: 400, height: 400, minWidth: 200, minHeight: 100 },
  },
} as const satisfies Readonly<Record<CanonicalNodeKind, SpaceNodeCatalogItem>>;

export function findSpaceNodeCatalogItem(kind: string): Readonly<SpaceNodeCatalogItem> | undefined {
  const definition = findNodeDefinition(kind);
  return definition ? spaceNodeCatalog[definition.kind] : undefined;
}

export function isSpaceNodeAuthorable(kind: string): boolean {
  return Boolean(findNodeDefinition(kind)) && !isUnavailableEditNodeKind(kind);
}

export const spaceAuthorableNodeKinds = canonicalNodeKinds.filter(isSpaceNodeAuthorable);

const portLabels: Readonly<Partial<Record<string, Readonly<Record<string, string>>>>> = {
  "input.image": { reference: "Ref", image: "Image" },
  "input.audio": { audio: "Audio" },
  "input.video": { video: "Video" },
  "input.prompt": { text: "Text" },
  "process.promptConstructor": { text: "Text" },
  "generate.image": { prompt: "Prompt", primary: "Image", references: "Image", image: "Image" },
  "generate.audio": { prompt: "Prompt", audio: "Audio" },
  "generate.video": { prompt: "Prompt", initImage: "Image", video: "Video" },
  "generate.assistant": { text: "Text", item: "Selected item", images: "Image", videos: "Video" },
  "edit.image.annotation": { image: "Image" },
  "edit.image.resize": { image: "Image In" },
  "edit.image.removeBackground": { image: "Image In" },
  "edit.image.splitGrid": { image: "Image", images: "Ref" },
  "edit.image.gif": { frames: "Frame", image: "GIF Out" },
  "edit.video.stitch": { clips: "Video", soundtrack: "Audio", video: "Output" },
  "edit.video.trim": { video: "Video In" },
  "edit.video.frameGrab": { video: "Video In", image: "Image Out" },
  "edit.video.extractFrames": { video: "Video", frame: "Frame", startFrame: "Start frame", endFrame: "End frame" },
  "edit.video.easeCurve": { video: "Video In", settings: "Settings" },
  "output.single": { image: "Image", video: "Video", audio: "Audio" },
  "output.gallery": { image: "Image", video: "Video", audio: "Audio" },
  "inspect.imageCompare": { before: "A", after: "B" },
};

export function getSpacePortLabel(kind: string, port: PortDefinition): string {
  if (port.direction === "output") {
    if ((kind === "edit.image.resize" || kind === "edit.image.removeBackground") && port.id === "image") {
      return "Image Out";
    }
    if ((kind === "edit.video.trim" || kind === "edit.video.easeCurve") && port.id === "video") {
      return "Video Out";
    }
  }
  const labels = Object.hasOwn(portLabels, kind) ? portLabels[kind] : undefined;
  return (labels && Object.hasOwn(labels, port.id) ? labels[port.id] : undefined)
    ?? port.valueType.charAt(0).toUpperCase() + port.valueType.slice(1);
}
