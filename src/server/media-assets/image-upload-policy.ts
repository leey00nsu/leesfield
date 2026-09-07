import type { FileResponse, VariantOption } from "leemage-sdk";
import { parseImageVariants, type ImageVersion } from "@/shared/media-assets/image-variants";

const IMAGE_VARIANTS = [{ sizeLabel: "source", format: "webp" }] as const;
export function imageUploadOptions(mimeType: string): { variants?: VariantOption[] } {
  return mimeType.startsWith("image/") ? { variants: IMAGE_VARIANTS.map(option => ({ ...option })) } : {};
}

// Unknown or animated formats keep their original for full previews and execution.
export function detectImageAnimation(bytes: Uint8Array, mimeType: string): boolean | null {
  if (mimeType === "image/jpeg") return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const label = (start: number, length = 4) => String.fromCharCode(...bytes.subarray(start, start + length));
  if (mimeType === "image/png") {
    if (bytes.length < 8 || bytes[0] !== 137 || label(1, 3) !== "PNG") return null;
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const size = view.getUint32(offset);
      const kind = label(offset + 4);
      if (kind === "acTL") return true;
      if (kind === "IDAT" || kind === "IEND") return false;
      offset += size + 12;
    }
  }
  if (mimeType === "image/webp") {
    if (bytes.length < 20 || label(0) !== "RIFF" || label(8) !== "WEBP") return null;
    if (label(12) === "VP8X") return bytes.length > 20 ? Boolean(bytes[20] & 2) : null;
    if (["VP8 ", "VP8L"].includes(label(12))) return false;
  }
  return null;
}

function version(value: { url: string; format: string; size: number; width: number; height: number } | null | undefined): ImageVersion | null {
  if (!value) return null;
  return { url: value.url, mimeType: "image/" + (value.format === "jpg" ? "jpeg" : value.format), bytes: value.size, width: value.width, height: value.height };
}
export function mapUploadedImage(file: FileResponse, fallback: { url?: string; width?: number | null; height?: number | null; isAnimated?: boolean | null } = {}) {
  const url = file.url ?? fallback.url;
  if (!url) throw new Error("IMAGE_ORIGINAL_URL_MISSING");
  const original = file.variants.find(item => item.url === url);
  const width = original?.width ?? fallback.width ?? null;
  const height = original?.height ?? fallback.height ?? null;
  const fullWebp = file.mimeType === "image/webp" && width && height
    ? { url, format: "webp", size: file.size, width, height }
    : file.variants.find(item => item.format === "webp" && width && height &&
      ((item.width === width && item.height === height) || (item.width === height && item.height === width)));
  const display = version(fullWebp);
  const thumbnail = version(file.thumbnail);
  const imageVariants = parseImageVariants({ version: 1, isAnimated: fallback.isAnimated ?? (file.mimeType === "image/jpeg" ? false : null), display, thumbnail });
  return { url, mimeType: file.mimeType, bytes: file.size, width, height, imageVariants };
}
