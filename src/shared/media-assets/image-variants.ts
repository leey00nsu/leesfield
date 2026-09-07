import { z } from "zod";

const imageVersionSchema = z.object({
  url: z.string().url().refine(url => /^https?:\/\//.test(url)),
  mimeType: z.string().startsWith("image/"),
  bytes: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export const imageVariantsSchema = z.object({
  version: z.literal(1),
  isAnimated: z.boolean().nullable(),
  display: imageVersionSchema.nullable(),
  thumbnail: imageVersionSchema.nullable(),
});
export type ImageVersion = z.infer<typeof imageVersionSchema>;
export type ImageVariants = z.infer<typeof imageVariantsSchema>;
export function parseImageVariants(value: unknown): ImageVariants | null {
  const parsed = imageVariantsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function imageUrlsFor(asset: { url: string; imageVariants?: unknown }, purpose: "list" | "display" | "original"): string[] {
  const versions = parseImageVariants(asset.imageVariants);
  const display = versions?.isAnimated === false ? versions.display?.url : null;
  const urls = purpose === "list"
    ? [versions?.thumbnail?.url, display, asset.url]
    : purpose === "display" ? [display, asset.url] : [asset.url];
  return [...new Set(urls.filter((url): url is string => Boolean(url)))];
}
