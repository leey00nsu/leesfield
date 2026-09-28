/**
 * Image Processing Executors
 *
 * Executors for browser-side image processing nodes:
 * imageResize and gifEncoder. No external API calls.
 */

import type { GifEncoderNodeData, ImageResizeNodeData } from "@/types";
import type { NodeExecutionContext } from "./types";
import { resizeImage } from "@/utils/imageResize";
import { encodeFramesToGif } from "@/utils/gifEncode";

/**
 * ImageResize: takes a single upstream image and produces a resized image.
 */
export async function executeImageResize(ctx: NodeExecutionContext): Promise<void> {
  const { node, getConnectedInputs, updateNodeData, getFreshNode } = ctx;

  updateNodeData(node.id, { status: "loading", error: null });

  try {
    const { images } = getConnectedInputs(node.id);
    const sourceImage =
      images[0] ?? (getFreshNode(node.id)?.data as ImageResizeNodeData | undefined)?.sourceImage ?? null;

    if (!sourceImage) {
      updateNodeData(node.id, { status: "error", error: "Connect an image input to resize" });
      throw new Error("Connect an image input to resize");
    }

    const fresh = (getFreshNode(node.id)?.data ?? node.data) as ImageResizeNodeData;
    const result = await resizeImage(sourceImage, {
      mode: fresh.mode,
      width: fresh.width,
      height: fresh.height,
      maxEdge: fresh.maxEdge,
      scalePct: fresh.scalePct,
      fit: fresh.fit,
      padColor: fresh.padColor,
      format: fresh.format,
      quality: fresh.quality,
    });

    updateNodeData(node.id, {
      sourceImage,
      outputImage: result.dataUrl,
      outputDimensions: { width: result.width, height: result.height },
      outputBytes: result.bytes,
      status: "complete",
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateNodeData(node.id, { status: "error", error: message });
    throw err instanceof Error ? err : new Error(message);
  }
}

/**
 * GifEncoder: takes ordered upstream image frames and produces an animated GIF.
 *
 * Frame ordering follows clipOrder (edge IDs) when present, otherwise the
 * natural edge order on image-N target handles.
 */
export async function executeGifEncoder(ctx: NodeExecutionContext): Promise<void> {
  const { node, updateNodeData, getFreshNode, getEdges, getNodes } = ctx;

  updateNodeData(node.id, { status: "loading", error: null, progress: 0 });

  try {
    const fresh = (getFreshNode(node.id)?.data ?? node.data) as GifEncoderNodeData;
    const edges = getEdges();
    const nodes = getNodes();

    const incomingEdges = edges.filter(
      (e) => e.target === node.id && e.targetHandle?.startsWith("image-"),
    );
    const order = fresh.clipOrder?.length
      ? fresh.clipOrder.filter((eid) => incomingEdges.some((e) => e.id === eid))
      : incomingEdges.map((e) => e.id);
    const remaining = incomingEdges.map((e) => e.id).filter((eid) => !order.includes(eid));
    const finalOrder = [...order, ...remaining];

    const frameSrcs: string[] = [];
    for (const eid of finalOrder) {
      const edge = incomingEdges.find((e) => e.id === eid);
      if (!edge) continue;
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode) continue;
      const d = sourceNode.data as Record<string, unknown>;
      const src =
        (d.outputImage as string | null) ??
        (d.image as string | null) ??
        (d.capturedImage as string | null) ??
        null;
      if (src) frameSrcs.push(src);
    }

    if (frameSrcs.length < 2) {
      updateNodeData(node.id, { status: "error", error: "Connect at least 2 image frames", progress: 0 });
      throw new Error("Connect at least 2 image frames");
    }

    const result = await encodeFramesToGif(frameSrcs, {
      fps: fresh.fps,
      loopCount: fresh.loopCount,
      colorCount: fresh.colorCount,
      dither: fresh.dither,
      targetMaxBytes: fresh.targetMaxBytes,
      onProgress: (p) => updateNodeData(node.id, { progress: p }),
    });

    updateNodeData(node.id, {
      outputGif: result.dataUrl,
      outputBytes: result.bytes,
      outputDimensions: { width: result.width, height: result.height },
      status: "complete",
      progress: 100,
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateNodeData(node.id, { status: "error", error: message, progress: 0 });
    throw err instanceof Error ? err : new Error(message);
  }
}
