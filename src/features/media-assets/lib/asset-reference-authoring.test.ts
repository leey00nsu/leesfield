import { describe, expect, it } from "vitest";
import type { GradioField } from "@/shared/model-catalog/gradio-contract";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { assetReferenceValue } from "./asset-reference-authoring";
const field: GradioField = { name: "references", label: "References", kind: "files", media: "image", required: false, nullable: false, schema: { type: "array", items: { type: "string" }, maxItems: 2 } };
const asset = { id: "stable", type: "image", mimeType: "image/png", status: "completed", url: "https://storage.example/new.png" } as MediaAssetDto;
describe("asset reference authoring", () => {
  it("appends without overwriting existing references or mutating a draft", () => { const current = ["https://storage.example/old.png"]; expect(assetReferenceValue(field, current, asset)).toEqual([...current, asset.url]); expect(current).toHaveLength(1); });
  it("preserves nullable slot positions", () => { const nullable = { ...field, schema: { type: "array", items: { type: ["string", "null"] }, maxItems: 3 } }; expect(assetReferenceValue(nullable, [null, "old", null], asset)).toEqual([asset.url, "old", null]); });
  it("never replaces an occupied single input or exceeds limits", () => { expect(assetReferenceValue({ ...field, kind: "file", schema: {} }, "existing", asset)).toBeUndefined(); expect(assetReferenceValue(field, ["a", "b"], asset)).toBeUndefined(); expect(assetReferenceValue(field, [asset.url], asset)).toBeUndefined(); });
  it("keeps MIME, media, status, hidden and paired role restrictions", () => { for (const blocked of [{ ...field, media: "video" as const }, { ...field, hidden: true }, { ...field, attachment: { role: "paired_audio" as const, pairedWith: "video", pairing: "index" as const } }]) expect(assetReferenceValue(blocked, [], asset)).toBeUndefined(); expect(assetReferenceValue(field, [], { ...asset, status: "failed" })).toBeUndefined(); expect(assetReferenceValue(field, [], { ...asset, mimeType: "application/pdf" })).toBeUndefined(); });
});
