/**
 * Shared utility for downloading media (images, video, audio) from nodes.
 * Handles both data URLs (base64) and HTTP URLs.
 */

/** Infer a file extension from a data URL's MIME type. */
function extensionFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;,]+)/);
  if (!match) return "bin";
  const mime = match[1];
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/aac": "aac",
    "audio/mp4": "m4a",
    // 3D models, which ComfyUI workflows can produce
    "model/gltf-binary": "glb",
    "model/gltf+json": "gltf",
    "model/vnd.usdz+zip": "usdz",
  };
  return map[mime] ?? mime.split("/")[1] ?? "bin";
}

/** Infer a file extension from a URL path. */
function extensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split(".").pop()?.toLowerCase();
    if (ext && ext.length <= 5 && ext.length >= 2) return ext;
  } catch {
    // not a valid URL
  }
  return "bin";
}

export type MediaType = "image" | "video" | "audio";

/**
 * Download media content via an anchor-click approach.
 *
 * @param src       - Data URL (base64) or HTTP URL of the media
 * @param mediaType - Hint for file extension when MIME detection fails
 * @param filename  - Optional custom filename (without extension)
 */
export async function downloadMedia(
  src: string,
  mediaType: MediaType = "image",
  filename?: string,
): Promise<void> {
  const fallbackExt: Record<MediaType, string> = {
    image: "png",
    video: "mp4",
    audio: "mp3",
  };

  const isHttp = src.startsWith("http://") || src.startsWith("https://");
  const ext = isHttp
    ? extensionFromUrl(src)
    : extensionFromDataUrl(src);
  const finalExt = ext === "bin" ? fallbackExt[mediaType] : ext;
  const finalName = filename
    ? `${filename}.${finalExt}`
    : `${mediaType}-${Date.now()}.${finalExt}`;

  if (isHttp) {
    try {
      const response = await fetch(src);
      if (!response.ok) {
        console.error(`Failed to download: ${response.status} ${response.statusText}`);
        return;
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      triggerDownload(blobUrl, finalName);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Failed to download:", error);
    }
    return;
  }

  // Data URL — direct download
  triggerDownload(src, finalName);
}

function triggerDownload(href: string, filename: string): void {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
