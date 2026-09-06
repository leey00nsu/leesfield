import JSZip from "jszip";
import type { NodeBananaRuntimeGraph } from "@node-banana-runtime/runtime-entry";
import { resolveNodeInputAssetId } from "../model/node-graph-inputs";

/** Mirror upstream ZIP's four eligible kinds and graph order, not click order. */
export function selectedImageAssetIds(graph: NodeBananaRuntimeGraph, selectedIds: readonly string[]): string[] {
  const selected = new Set(selectedIds);
  const activeGraph = { ...graph, edges: graph.edges.filter((edge) => !edge.data?.hasPause) };
  return graph.nodes.flatMap((node) => {
    if (!selected.has(node.id)) return [];
    const config = node.data.config as Record<string, unknown> | undefined;
    let asset: unknown;
    switch (node.data.canonicalKind) {
      case "input.image":
        // A connected-but-empty input must not export the hidden local fallback.
        asset = activeGraph.edges.some((edge) => edge.target === node.id
          && (edge.data?.targetPortId === "reference" || edge.targetHandle === "reference")
          && graph.nodes.find((candidate) => candidate.id === edge.source)?.data.canonicalKind !== "edit.image.splitGrid")
          ? resolveNodeInputAssetId(activeGraph, node.id, "reference") : config?.assetId;
        break;
      case "edit.image.annotation":
      case "generate.image":
        asset = node.data.selectedOutputAssetId;
        break;
      case "output.single":
        if (config?.mediaType && config.mediaType !== "image") return [];
        asset = resolveNodeInputAssetId(activeGraph, node.id, "image");
        break;
      default: return [];
    }
    return typeof asset === "string" && asset ? [asset] : [];
  });
}

export const IMAGE_ZIP_MAX_FILES = 100;
export const IMAGE_ZIP_MAX_BYTES = 100 * 1024 * 1024;
const extensions: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
  "image/gif": "gif", "image/avif": "avif", "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

/** Only owner-authenticated, same-origin assets; never download preview URLs. */
export async function buildImageZip(
  assetIds: readonly string[],
  signal: AbortSignal,
  fetchAsset: typeof fetch = fetch,
): Promise<ArrayBuffer> {
  signal.throwIfAborted();
  if (!assetIds.length) throw new Error("No saved images are selected.");
  if (assetIds.length > IMAGE_ZIP_MAX_FILES) throw new Error("Select at most 100 images for a ZIP.");
  if (assetIds.some((id) => !/^[A-Za-z0-9_-]{1,128}$/.test(id))) {
    throw new Error("An image has no valid saved asset reference.");
  }
  const zip = new JSZip();
  let total = 0;
  // Sequential reads bound memory and preserve the selected-node ordering.
  for (const [index, id] of assetIds.entries()) {
    signal.throwIfAborted();
    const response = await fetchAsset(`/api/media-assets/${encodeURIComponent(id)}/content`, {
      signal, credentials: "same-origin", redirect: "error", cache: "no-store",
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`Image download failed (${response.status}).`);
    }
    const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    const extension = extensions[mime];
    if (!extension || !response.body) {
      await response.body?.cancel().catch(() => {});
      throw new Error("The selected asset is not a supported image.");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > IMAGE_ZIP_MAX_BYTES - total) {
        throw new Error("The images exceed the 100 MiB ZIP limit.");
      }
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        total += value.byteLength;
        length += value.byteLength;
        if (total > IMAGE_ZIP_MAX_BYTES) throw new Error("The images exceed the 100 MiB ZIP limit.");
        chunks.push(value);
      }
      if (!length) throw new Error("The selected image is empty.");
    } finally {
      signal.removeEventListener("abort", cancel);
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    zip.file(`leesfield-image-${String(index + 1).padStart(3, "0")}.${extension}`, bytes);
  }
  signal.throwIfAborted();
  const buffer = await zip.generateAsync({ type: "arraybuffer", compression: "STORE" }, () => signal.throwIfAborted());
  signal.throwIfAborted();
  return buffer;
}

/** The caller owns cancellation on Space/account changes and duplicate clicks. */
export async function downloadImageZip(assetIds: readonly string[], signal: AbortSignal): Promise<void> {
  const buffer = await buildImageZip(assetIds, signal);
  signal.throwIfAborted();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/zip" }));
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = `leesfield-images-${Date.now()}.zip`;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Allow the browser to consume the URL before revoking it.
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}
