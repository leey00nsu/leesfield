import type { CanonicalNodeKind } from "./node-registry";
import type { CanonicalJsonValue } from "./canonical-graph";

/** Editor-neutral initial authoring values; model defaults remain model-owned. */
export function defaultConfigForKind(kind: CanonicalNodeKind): Record<string, CanonicalJsonValue> {
  if (kind === "note.memo") return { text: "" };
  if (kind === "process.promptConstructor") return { template: "" };
  if (kind.startsWith("input.")) return kind === "input.prompt" ? { text: "" } : { assetId: null };
  if (kind === "generate.assistant") return { prompt: "", modelKey: null };
  if (kind.startsWith("generate.")) return { prompt: "", modelKey: null, parameters: {} };
  if (kind === "edit.image.removeBackground") return { parameters: { model: "isnet_fp16" } };
  if (kind === "edit.image.resize") return { parameters: { mode: "exact", width: 128, height: 128, maxEdge: 128, scalePct: 100, fit: "contain", padColor: "#00000000", format: "png", quality: 0.9 } };
  if (kind === "edit.image.gif") return { parameters: { fps: 8, loopCount: 0, colorCount: 128, dither: false, targetMaxBytes: 128 * 1024, clipOrder: [] } };
  if (kind === "edit.video.stitch") return { parameters: { repeat: 1, stripAudio: false, clipOrder: [] } };
  if (kind === "edit.video.trim") return { parameters: { startMs: 0, endMs: 5000, stripAudio: false } };
  if (kind === "edit.video.frameGrab") return { parameters: { position: "first" } };
  if (kind === "edit.video.extractFrames") return { parameters: { timestampMs: 0 } };
  if (kind === "edit.video.easeCurve") return { parameters: { outputDurationMs: 1500, easingPreset: "easeInOutSine", bezier: [0.42, 0, 0.58, 1] } };
  if (kind.startsWith("edit.")) return { parameters: {} };
  if (kind.startsWith("output.")) return { mediaType: null };
  return {};
}
