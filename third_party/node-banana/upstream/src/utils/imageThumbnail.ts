/**
 * Generates a lower-resolution JPEG thumbnail from a base64 image data URL.
 * Used for adaptive image resolution — rendering smaller images when nodes
 * are small in the viewport.
 */
export async function generateThumbnail(
  base64DataUrl: string,
  maxDim: number = 256,
  quality: number = 0.6
): Promise<string> {
  if (!base64DataUrl) return base64DataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;

      // Skip if already small enough
      if (w <= maxDim && h <= maxDim) {
        resolve(base64DataUrl);
        return;
      }

      // Calculate scaled dimensions preserving aspect ratio
      const scale = Math.min(maxDim / w, maxDim / h);
      const newW = Math.round(w * scale);
      const newH = Math.round(h * scale);

      const canvas = document.createElement("canvas");
      canvas.width = newW;
      canvas.height = newH;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(base64DataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0, newW, newH);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(base64DataUrl);
    img.src = base64DataUrl;
  });
}
