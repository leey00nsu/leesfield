import type {
  CanonicalNodeKind,
  PortDefinition,
  PortValueType,
} from "@/shared/generation-graph/node-registry";

export type NodeBananaNodeInventoryItem = {
  title: string;
  paletteLabel: string;
  category: "Input" | "Text" | "Generate" | "Process" | "Output";
  mediaType: PortValueType;
  upstreamComponent: string | null;
  parity: "upstream" | "upstream-extended";
};

export type NodeBananaNodeGeometry = {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
};

/**
 * User-visible Node inventory from Node Banana v1.9.0.
 * Canonical kinds stay on the adapter side and must never be used as labels.
 */
export const nodeBananaNodeInventory = {
  "input.image": { title: "Image Input", paletteLabel: "Image Input", category: "Input", mediaType: "image", upstreamComponent: "ImageInputNode.tsx", parity: "upstream" },
  "input.audio": { title: "Audio Input", paletteLabel: "Audio Input", category: "Input", mediaType: "audio", upstreamComponent: "AudioInputNode.tsx", parity: "upstream" },
  "input.video": { title: "Video Input", paletteLabel: "Video Input", category: "Input", mediaType: "video", upstreamComponent: "VideoInputNode.tsx", parity: "upstream" },
  "input.prompt": { title: "Prompt", paletteLabel: "Prompt", category: "Text", mediaType: "text", upstreamComponent: "PromptNode.tsx", parity: "upstream" },
  "process.promptConstructor": { title: "Prompt Constructor", paletteLabel: "Prompt Constructor", category: "Text", mediaType: "text", upstreamComponent: "PromptConstructorNode.tsx", parity: "upstream" },
  "generate.image": { title: "Generate Image", paletteLabel: "Generate Image", category: "Generate", mediaType: "image", upstreamComponent: "GenerateImageNode.tsx", parity: "upstream" },
  "generate.audio": { title: "Generate Audio", paletteLabel: "Generate Audio", category: "Generate", mediaType: "audio", upstreamComponent: "GenerateAudioNode.tsx", parity: "upstream" },
  "generate.video": { title: "Generate Video", paletteLabel: "Generate Video", category: "Generate", mediaType: "video", upstreamComponent: "GenerateVideoNode.tsx", parity: "upstream" },
  "edit.image.annotation": { title: "Annotation", paletteLabel: "Annotate", category: "Process", mediaType: "image", upstreamComponent: "AnnotationNode.tsx", parity: "upstream" },
  "edit.image.resize": { title: "Image Resize", paletteLabel: "Image Resize", category: "Process", mediaType: "image", upstreamComponent: "ImageResizeNode.tsx", parity: "upstream" },
  "edit.image.removeBackground": { title: "Remove Background", paletteLabel: "Remove Background", category: "Process", mediaType: "image", upstreamComponent: "RemoveBackgroundNode.tsx", parity: "upstream" },
  "edit.image.splitGrid": { title: "Split Grid", paletteLabel: "Split Grid", category: "Process", mediaType: "image", upstreamComponent: "SplitGridNode.tsx", parity: "upstream" },
  "edit.image.gif": { title: "GIF Encoder", paletteLabel: "GIF Encoder", category: "Process", mediaType: "image", upstreamComponent: "GifEncoderNode.tsx", parity: "upstream" },
  "edit.video.stitch": { title: "Video Stitch", paletteLabel: "Video Stitch", category: "Process", mediaType: "video", upstreamComponent: "VideoStitchNode.tsx", parity: "upstream" },
  "edit.video.trim": { title: "Video Trim", paletteLabel: "Video Trim", category: "Process", mediaType: "video", upstreamComponent: "VideoTrimNode.tsx", parity: "upstream" },
  "edit.video.frameGrab": { title: "Frame Grab", paletteLabel: "Frame Grab", category: "Process", mediaType: "video", upstreamComponent: "VideoFrameGrabNode.tsx", parity: "upstream" },
  "edit.video.easeCurve": { title: "Ease Curve", paletteLabel: "Ease Curve", category: "Process", mediaType: "video", upstreamComponent: "EaseCurveNode.tsx", parity: "upstream" },
  "output.single": { title: "Output", paletteLabel: "Output", category: "Output", mediaType: "media", upstreamComponent: "OutputNode.tsx", parity: "upstream" },
  "output.gallery": { title: "Output Gallery", paletteLabel: "Output Gallery", category: "Output", mediaType: "media", upstreamComponent: "OutputGalleryNode.tsx", parity: "upstream-extended" },
  "inspect.imageCompare": { title: "Image Compare", paletteLabel: "Image Compare", category: "Process", mediaType: "image", upstreamComponent: "ImageCompareNode.tsx", parity: "upstream" },
} as const satisfies Readonly<Record<CanonicalNodeKind, NodeBananaNodeInventoryItem>>;

/**
 * Default dimensions copied from Node Banana v1.9.0 nodeDefaults.ts.
 */
export const nodeBananaNodeGeometry = {
  "input.image": { width: 300, height: 280, minWidth: 180, minHeight: 100 },
  "input.audio": { width: 300, height: 200, minWidth: 250, minHeight: 150 },
  "input.video": { width: 300, height: 280, minWidth: 180, minHeight: 100 },
  "input.prompt": { width: 320, height: 220, minWidth: 180, minHeight: 100 },
  "process.promptConstructor": { width: 340, height: 280, minWidth: 180, minHeight: 100 },
  "generate.image": { width: 300, height: 300, minWidth: 180, minHeight: 100 },
  "generate.audio": { width: 300, height: 280, minWidth: 300, minHeight: 250 },
  "generate.video": { width: 300, height: 300, minWidth: 180, minHeight: 100 },
  "edit.image.annotation": { width: 300, height: 280, minWidth: 180, minHeight: 100 },
  "edit.image.resize": { width: 320, height: 360, minWidth: 300, minHeight: 340 },
  "edit.image.removeBackground": { width: 320, height: 320, minWidth: 320, minHeight: 320 },
  "edit.image.splitGrid": { width: 300, height: 400, minWidth: 260, minHeight: 340 },
  "edit.image.gif": { width: 480, height: 380, minWidth: 460, minHeight: 340 },
  "edit.video.stitch": { width: 400, height: 280, minWidth: 500, minHeight: 280 },
  "edit.video.trim": { width: 360, height: 360, minWidth: 360, minHeight: 360 },
  "edit.video.frameGrab": { width: 320, height: 320, minWidth: 320, minHeight: 320 },
  "edit.video.easeCurve": { width: 340, height: 280, minWidth: 340, minHeight: 100 },
  "output.single": { width: 320, height: 320, minWidth: 200, minHeight: 100 },
  "output.gallery": { width: 320, height: 360, minWidth: 200, minHeight: 100 },
  "inspect.imageCompare": { width: 400, height: 360, minWidth: 200, minHeight: 100 },
} as const satisfies Readonly<Record<CanonicalNodeKind, NodeBananaNodeGeometry>>;

export type NodeBananaUpstreamHandle = {
  direction: "input" | "output";
  label: string;
  dynamic?: boolean;
};

export type NodeBananaHeaderAction = "required" | "comment" | "expand" | "run";

const header = (...actions: NodeBananaHeaderAction[]) => actions;

/**
 * FloatingNodeHeader actions observed in the upstream v1.9.0 WorkflowCanvas.
 * This is kept separate from each Node body because upstream renders headers
 * through a ViewportPortal rather than inside individual Node components.
 */
export const nodeBananaUpstreamHeaderContract = {
  "input.image": header("required", "comment"),
  "input.audio": header("required", "comment"),
  "input.video": header("comment"),
  "input.prompt": header("required", "comment", "expand"),
  "process.promptConstructor": header("comment", "expand"),
  "generate.image": header("comment", "run"),
  "generate.audio": header("comment", "run"),
  "generate.video": header("comment", "run"),
  "edit.image.annotation": header("comment", "expand"),
  "edit.image.resize": header("comment"),
  "edit.image.removeBackground": header("comment", "run"),
  "edit.image.splitGrid": header("comment", "expand"),
  "edit.image.gif": header("comment"),
  "edit.video.stitch": header("comment"),
  "edit.video.trim": header("comment"),
  "edit.video.frameGrab": header("comment"),
  "edit.video.easeCurve": header("comment"),
  "output.single": header("comment"),
  "output.gallery": header("comment"),
  "inspect.imageCompare": header("comment"),
} as const satisfies Readonly<Record<CanonicalNodeKind, readonly NodeBananaHeaderAction[]>>;

/**
 * Hosted actions after applying explicit F059 product decisions. Generation
 * Nodes keep the requested compact/Expand interaction. Split Grid's upstream
 * template expansion is omitted with its excluded router materialization
 * subsystem; its body controls remain functional.
 */
export const nodeBananaHostedHeaderContract = {
  ...nodeBananaUpstreamHeaderContract,
  "generate.image": header("comment", "expand", "run"),
  "generate.audio": header("comment", "expand", "run"),
  "generate.video": header("comment", "expand", "run"),
  "edit.image.splitGrid": header("comment"),
} as const satisfies Readonly<Record<CanonicalNodeKind, readonly NodeBananaHeaderAction[]>>;

/**
 * Independent v1.9.0 source audit. IDs deliberately stay out of this visible
 * contract because several dynamic upstream handles map to one stable
 * canonical ordered-list port in the Leesfield adapter.
 */
export const nodeBananaUpstreamContract = {
  "input.image": { handles: [{ direction: "input", label: "Ref" }, { direction: "output", label: "Image" }], behavior: "upload-or-connected-image" },
  "input.audio": { handles: [{ direction: "input", label: "Audio" }, { direction: "output", label: "Audio" }], behavior: "upload-or-connected-audio" },
  "input.video": { handles: [{ direction: "input", label: "Video" }, { direction: "output", label: "Video" }], behavior: "upload-or-connected-video" },
  "input.prompt": { handles: [{ direction: "input", label: "Text" }, { direction: "output", label: "Text" }], behavior: "editable-text" },
  "process.promptConstructor": { handles: [{ direction: "input", label: "Text" }, { direction: "output", label: "Text" }], behavior: "editable-text" },
  "generate.image": { handles: [{ direction: "input", label: "Image" }, { direction: "input", label: "Prompt" }, { direction: "output", label: "Image" }], behavior: "model-generation" },
  "generate.audio": { handles: [{ direction: "input", label: "Prompt" }, { direction: "output", label: "Audio" }], behavior: "model-generation" },
  "generate.video": { handles: [{ direction: "input", label: "Image" }, { direction: "input", label: "Prompt" }, { direction: "output", label: "Video" }], behavior: "model-generation" },
  "edit.image.annotation": { handles: [{ direction: "input", label: "Image" }, { direction: "output", label: "Image" }], behavior: "konva-annotation" },
  "edit.image.resize": { handles: [{ direction: "input", label: "Image In" }, { direction: "output", label: "Image Out" }], behavior: "image-resize" },
  "edit.image.removeBackground": { handles: [{ direction: "input", label: "Image In" }, { direction: "output", label: "Image Out" }], behavior: "background-removal" },
  "edit.image.splitGrid": { handles: [{ direction: "input", label: "Image" }, { direction: "output", label: "Ref" }], behavior: "ordered-grid-images" },
  "edit.image.gif": { handles: [{ direction: "input", label: "Frame", dynamic: true }, { direction: "output", label: "GIF Out" }], behavior: "ordered-frame-gif" },
  "edit.video.stitch": { handles: [{ direction: "input", label: "Video", dynamic: true }, { direction: "input", label: "Audio" }, { direction: "output", label: "Output" }], behavior: "ordered-video-stitch" },
  "edit.video.trim": { handles: [{ direction: "input", label: "Video In" }, { direction: "output", label: "Video Out" }], behavior: "video-trim" },
  "edit.video.frameGrab": { handles: [{ direction: "input", label: "Video In" }, { direction: "output", label: "Image Out" }], behavior: "video-frame-grab" },
  "edit.video.easeCurve": { handles: [{ direction: "input", label: "Video In" }, { direction: "output", label: "Video Out" }, { direction: "input", label: "Settings" }, { direction: "output", label: "Settings" }], behavior: "video-ease-curve" },
  "output.single": { handles: [{ direction: "input", label: "Image" }, { direction: "input", label: "Video" }, { direction: "input", label: "Audio" }], behavior: "single-media-output" },
  "output.gallery": { handles: [{ direction: "input", label: "Image" }, { direction: "input", label: "Video" }, { direction: "input", label: "Audio" }], behavior: "media-gallery" },
  "inspect.imageCompare": { handles: [{ direction: "input", label: "A" }, { direction: "input", label: "B" }], behavior: "image-comparison" },
} as const satisfies Readonly<Record<CanonicalNodeKind, {
  handles: readonly NodeBananaUpstreamHandle[];
  behavior: string;
}>>;

function fallbackPortLabel(port: PortDefinition) {
  if (port.valueType === "media") return "Media";
  return port.valueType.charAt(0).toUpperCase() + port.valueType.slice(1);
}

const exactPortLabels: Partial<Record<CanonicalNodeKind, Record<string, string>>> = {
  "input.image": { reference: "Ref", image: "Image" },
  "input.audio": { audio: "Audio" },
  "input.video": { video: "Video" },
  "input.prompt": { text: "Text" },
  "process.promptConstructor": { text: "Text" },
  "generate.image": { prompt: "Prompt", primary: "Image", references: "Image", image: "Image" },
  "generate.audio": { prompt: "Prompt", audio: "Audio" },
  "generate.video": { prompt: "Prompt", initImage: "Image", video: "Video" },
  "edit.image.annotation": { image: "Image" },
  "edit.image.resize": { image: "Image In" },
  "edit.image.removeBackground": { image: "Image In" },
  "edit.image.splitGrid": { image: "Image", images: "Ref" },
  "edit.image.gif": { frames: "Frame", image: "GIF Out" },
  "edit.video.stitch": { clips: "Video", soundtrack: "Audio", video: "Output" },
  "edit.video.trim": { video: "Video In" },
  "edit.video.frameGrab": { video: "Video In", image: "Image Out" },
  "edit.video.easeCurve": { video: "Video In", settings: "Settings" },
  "output.single": { image: "Image", video: "Video", audio: "Audio" },
  "output.gallery": { image: "Image", video: "Video", audio: "Audio" },
  "inspect.imageCompare": { before: "A", after: "B" },
};

export function getNodeBananaPortLabel(kind: CanonicalNodeKind, port: PortDefinition) {
  const label = exactPortLabels[kind]?.[port.id] ?? fallbackPortLabel(port);
  if (port.direction === "output") {
    if (kind === "edit.image.resize" && port.id === "image") return "Image Out";
    if (kind === "edit.image.removeBackground" && port.id === "image") return "Image Out";
    if (kind === "edit.video.trim" && port.id === "video") return "Video Out";
    if (kind === "edit.video.easeCurve" && port.id === "video") return "Video Out";
  }
  return label;
}
