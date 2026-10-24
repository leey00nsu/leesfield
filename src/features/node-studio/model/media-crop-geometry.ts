import { normalizeCrop, type CropRectangle } from "@/shared/media-assets/direct-media-edit";

export const cropPresets = ["original", "1:1", "4:3", "3:4", "16:9", "9:16"] as const;
export type CropHandle = "move" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export function presetCrop(width: number, height: number, preset: string): CropRectangle {
  const [x, y] = preset.split(":").map(Number);
  if (!x || !y) return { x: 0, y: 0, width, height };
  const w = Math.min(width, height * x / y), h = w * y / x;
  return normalizeCrop({ x: (width - w) / 2, y: (height - h) / 2, width: w, height: h }, width, height, false);
}
export function adjustCrop(rect: CropRectangle, handle: CropHandle, dx: number, dy: number, width: number, height: number, video: boolean) {
  const min = video ? 2 : 1, clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
  if (handle === "move") return normalizeCrop({ ...rect, x: clamp(rect.x + dx, 0, width - rect.width),
    y: clamp(rect.y + dy, 0, height - rect.height) }, width, height, video);
  let left = rect.x, top = rect.y, right = rect.x + rect.width, bottom = rect.y + rect.height;
  if (handle.includes("w")) left = clamp(left + dx, 0, right - min);
  if (handle.includes("e")) right = clamp(right + dx, left + min, width);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - min);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + min, height);
  return normalizeCrop({ x: left, y: top, width: right - left, height: bottom - top }, width, height, video);
}

/** Contains the entire original; the node's previous cover-fit is irrelevant. */
export function containedMediaBox(box: { x: number; y: number; width: number; height: number }, width: number, height: number) {
  const scale = Math.min(box.width / width, box.height / height);
  return { x: box.x + (box.width - width * scale) / 2, y: box.y + (box.height - height * scale) / 2,
    width: width * scale, height: height * scale };
}

export function mediaEditBarPosition(box: { x: number; y: number; width: number; height: number }, barWidth: number, barHeight: number,
  viewport: { width: number; height: number }, above: boolean, canvasTop = 64) {
  const w = Math.min(barWidth, viewport.width - 16), minY = Math.max(8, canvasTop + 8), maxY = Math.max(minY, viewport.height - barHeight - 88);
  let y = above ? box.y - barHeight - 12 : box.y + box.height + 12;
  if (y < minY) y = box.y + box.height + 12;
  if (y > maxY) y = box.y - barHeight - 12;
  return { left: Math.max(8, Math.min(viewport.width - w - 8, box.x + box.width / 2 - w / 2)),
    top: Math.max(minY, Math.min(maxY, y)), width: w };
}
