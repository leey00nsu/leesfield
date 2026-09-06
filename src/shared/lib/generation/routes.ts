export const mediaTypes = ["image", "video", "audio"] as const;
export type MediaType = (typeof mediaTypes)[number];
export function normalizeMediaType(value: unknown): MediaType {
  return mediaTypes.includes(value as MediaType)
    ? (value as MediaType)
    : "image";
}
export function generationHref(
  type: MediaType,
  query: Record<string, string | string[] | undefined> = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "type" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value])
      params.append(key, item);
  }
  params.set("type", type);
  return "/generate?" + params.toString();
}
