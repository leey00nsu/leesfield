import { allowedMediaMimeTypes, type MediaType } from "./media-asset-contract";

const extensions: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif",
  wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg", flac: "audio/flac", aac: "audio/aac", m4a: "audio/mp4",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
};
const aliases: Record<string, string> = { "audio/x-wav": "audio/wav", "audio/wave": "audio/wav", "audio/x-flac": "audio/flac", "image/jpg": "image/jpeg" };
export function droppedMediaType(mime: string): MediaType | null {
  const normalized = aliases[mime.toLowerCase()] ?? mime.toLowerCase();
  return (Object.keys(allowedMediaMimeTypes) as MediaType[]).find(type => (allowedMediaMimeTypes[type] as readonly string[]).includes(normalized)) ?? null;
}
/** Metadata validation only. The existing upload service still verifies bytes and limits. */
export function normalizeDroppedMediaFile(file: File): File | null {
  const extensionMime = extensions[file.name.split(".").at(-1)?.toLowerCase() ?? ""];
  const declared = aliases[file.type.toLowerCase()] ?? file.type.toLowerCase();
  const mime = declared === "" || declared === "application/octet-stream" ? extensionMime : declared;
  if (!mime || !droppedMediaType(mime) || (extensionMime && extensionMime !== mime)) return null;
  return mime === file.type ? file : new File([file], file.name, { type: mime, lastModified: file.lastModified });
}
export function isFileDrag(data: DataTransfer): boolean {
  return Array.from(data.types ?? []).includes("Files") || Array.from(data.items ?? []).some(item => item.kind === "file");
}
export function fileInputAccepts(input: HTMLInputElement, file: File): boolean {
  const accept = input.accept.split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  return !accept.length || accept.some(value => value.startsWith(".") ? file.name.toLowerCase().endsWith(value)
    : value.endsWith("/*") ? file.type.startsWith(value.slice(0, -1)) : file.type === value);
}
