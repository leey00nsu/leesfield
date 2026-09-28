import { encodeFramesToGif } from "../utils/gifEncode";
import { splitWithDimensions } from "../utils/gridSplitter";
import { resizeImage } from "../utils/imageResize";

export type ImageOperationKind =
  | "edit.image.annotation"
  | "edit.image.resize"
  | "edit.image.splitGrid"
  | "edit.image.gif";

type AnnotationShapeBase = {
  id: string;
  x: number;
  y: number;
  stroke: string;
  strokeWidth: number;
  opacity: number;
};
export type AnnotationShape =
  | (AnnotationShapeBase & { type: "rectangle"; width: number; height: number; fill: string | null })
  | (AnnotationShapeBase & { type: "circle"; radiusX: number; radiusY: number; fill: string | null })
  | (AnnotationShapeBase & { type: "arrow" | "freehand"; points: number[] })
  | (AnnotationShapeBase & { type: "text"; text: string; fill: string; fontSize: number });

export type ResizeOperationParameters = {
  mode: "exact" | "maxEdge" | "scale";
  width: number;
  height: number;
  maxEdge: number;
  scalePct: number;
  fit: "contain" | "cover" | "stretch";
  padColor: string;
  format: "keep" | "png" | "jpeg" | "webp";
  quality: number;
};

export type SplitGridOperationParameters = {
  rows: number;
  cols: number;
  colOffsets: number[];
  rowOffsets: number[];
};

export type GifOperationParameters = {
  fps: number;
  loopCount: number;
  colorCount: number;
  dither: boolean;
  targetMaxBytes: number | null;
};

export type ImageOperationParameters =
  | { shapes: AnnotationShape[] }
  | ResizeOperationParameters
  | SplitGridOperationParameters
  | GifOperationParameters;

export type ImageOperationRequest = {
  kind: ImageOperationKind;
  inputUrls: string[];
  parameters: ImageOperationParameters;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
};

export type ImageOperationResultItem = {
  blob: Blob;
  fileName: string;
  mimeType: string;
  sortOrder: number;
  width: number;
  height: number;
};

export type ImageOperationResult = { outputs: ImageOperationResultItem[] };

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Image operation cancelled", "AbortError");
}

function loadImage(src: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    const abort = () => {
      image.src = "";
      reject(new DOMException("Image operation cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    image.onload = () => {
      signal?.removeEventListener("abort", abort);
      resolve(image);
    };
    image.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(new Error("Failed to load image operation input"));
    };
    image.src = src;
  });
}

async function dataUrlToItem(
  dataUrl: string,
  index: number,
  dimensions?: { width: number; height: number },
): Promise<ImageOperationResultItem> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const mimeType = blob.type || /^data:([^;,]+)/.exec(dataUrl)?.[1] || "image/png";
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] || "bin";
  let size = dimensions;
  if (!size) {
    const image = await loadImage(dataUrl);
    size = { width: image.naturalWidth, height: image.naturalHeight };
  }
  return {
    blob,
    fileName: `node-banana-${String(index + 1).padStart(2, "0")}.${extension}`,
    mimeType,
    sortOrder: index,
    width: size.width,
    height: size.height,
  };
}

async function annotate(
  src: string,
  shapes: AnnotationShape[],
  signal?: AbortSignal,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const image = await loadImage(src, signal);
  throwIfAborted(signal);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not get canvas 2d context");
  context.drawImage(image, 0, 0);
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const shape of shapes) {
    throwIfAborted(signal);
    context.beginPath();
    context.globalAlpha = shape.opacity;
    context.strokeStyle = shape.stroke;
    if (shape.type === "text") {
      context.fillStyle = shape.fill;
      context.font = `${shape.fontSize}px sans-serif`;
      context.fillText(shape.text, shape.x, shape.y);
      continue;
    }
    context.lineWidth = shape.strokeWidth;
    if (shape.type === "rectangle") {
      if (shape.fill) { context.fillStyle = shape.fill; context.fillRect(shape.x, shape.y, shape.width, shape.height); }
      context.strokeRect(shape.x, shape.y, shape.width, shape.height);
    } else if (shape.type === "circle") {
      context.ellipse(shape.x, shape.y, shape.radiusX, shape.radiusY, 0, 0, Math.PI * 2);
      if (shape.fill) { context.fillStyle = shape.fill; context.fill(); }
      context.stroke();
    } else {
      const [x, y, ...points] = shape.points;
      context.moveTo((x ?? 0) + shape.x, (y ?? 0) + shape.y);
      for (let point = 0; point < points.length; point += 2) {
        context.lineTo((points[point] ?? 0) + shape.x, (points[point + 1] ?? 0) + shape.y);
      }
      context.stroke();
      if (shape.type === "arrow" && shape.points.length >= 4) {
        const x2 = shape.points.at(-2) ?? 0;
        const y2 = shape.points.at(-1) ?? 0;
        const x1 = shape.points.at(-4) ?? 0;
        const y1 = shape.points.at(-3) ?? 0;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = Math.max(8, shape.strokeWidth * 4);
        context.beginPath();
        context.moveTo(x2 + shape.x, y2 + shape.y);
        context.lineTo(x2 + shape.x - head * Math.cos(angle - Math.PI / 6), y2 + shape.y - head * Math.sin(angle - Math.PI / 6));
        context.moveTo(x2 + shape.x, y2 + shape.y);
        context.lineTo(x2 + shape.x - head * Math.cos(angle + Math.PI / 6), y2 + shape.y - head * Math.sin(angle + Math.PI / 6));
        context.stroke();
      }
    }
  }
  context.globalAlpha = 1;
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}

export async function processImageOperation(request: ImageOperationRequest): Promise<ImageOperationResult> {
  if (request.inputUrls.length === 0) throw new Error("Image operation requires input");
  throwIfAborted(request.signal);
  request.onProgress?.(5);

  if (request.kind === "edit.image.annotation") {
    const parameters = request.parameters as { shapes: AnnotationShape[] };
    const result = await annotate(request.inputUrls[0], parameters.shapes, request.signal);
    throwIfAborted(request.signal);
    request.onProgress?.(90);
    return { outputs: [await dataUrlToItem(result.dataUrl, 0, result)] };
  }

  if (request.kind === "edit.image.resize") {
    const result = await resizeImage(request.inputUrls[0], request.parameters as ResizeOperationParameters);
    throwIfAborted(request.signal);
    request.onProgress?.(90);
    return { outputs: [await dataUrlToItem(result.dataUrl, 0, result)] };
  }

  if (request.kind === "edit.image.splitGrid") {
    const parameters = request.parameters as SplitGridOperationParameters;
    const result = await splitWithDimensions(request.inputUrls[0], parameters.rows, parameters.cols, {
      colOffsets: parameters.colOffsets.length ? parameters.colOffsets : undefined,
      rowOffsets: parameters.rowOffsets.length ? parameters.rowOffsets : undefined,
    });
    const outputs: ImageOperationResultItem[] = [];
    for (let index = 0; index < result.images.length; index += 1) {
      throwIfAborted(request.signal);
      const cell = result.grid.cells[index];
      outputs.push(await dataUrlToItem(result.images[index], index, cell));
      request.onProgress?.(20 + Math.round(((index + 1) / result.images.length) * 70));
    }
    return { outputs };
  }

  const parameters = request.parameters as GifOperationParameters;
  const result = await encodeFramesToGif(request.inputUrls, {
    ...parameters,
    onProgress: (progress: number) => {
      throwIfAborted(request.signal);
      request.onProgress?.(Math.max(5, Math.min(90, progress)));
    },
  });
  throwIfAborted(request.signal);
  return {
    outputs: [await dataUrlToItem(result.dataUrl, 0, { width: result.width, height: result.height })],
  };
}
