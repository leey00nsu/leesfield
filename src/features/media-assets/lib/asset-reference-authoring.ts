import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { isAllowedMediaMimeType } from "@/shared/media-assets/media-asset-contract";
import { fileFieldMaxItems, gradioInputValues, type GradioField, type JsonValue } from "@/shared/model-catalog/gradio-contract";
import { fileFieldAllowsNullItems } from "@/shared/model-catalog/gradio-file-schema";

/** Authoring only: append or fill an empty positional slot; never replace a draft reference. */
export function assetReferenceValue(field: GradioField, current: unknown, asset: MediaAssetDto): JsonValue | undefined {
  if (field.hidden || field.attachment?.role === "paired_audio" || !["file", "files", "gallery"].includes(field.kind) || asset.status !== "completed" || !asset.url || !isAllowedMediaMimeType(asset.type, asset.mimeType) || (field.media && field.media !== asset.type)) return undefined;
  let next: JsonValue;
  if (field.kind === "file") { if (current != null && current !== "") return undefined; next = asset.url; }
  else {
    const items = Array.isArray(current) ? [...current] : [];
    if (items.includes(asset.url)) return undefined;
    const empty = fileFieldAllowsNullItems(field) ? items.indexOf(null) : -1;
    if (empty >= 0) items[empty] = asset.url;
    else if (items.length < fileFieldMaxItems(field)) items.push(asset.url);
    else return undefined;
    next = items as JsonValue[];
  }
  try {
    gradioInputValues({ version: 1, apiName: "/authoring", inputs: [field], output: null, diagnostics: [], reviewed: true }, { dynamicParams: { [field.name]: next } });
    return next;
  } catch { return undefined; }
}
