import { describe, expect, it } from "vitest";
import { assetNameSchema, normalizeAssetOrganizationName, updateAssetMetadataSchema, batchAssetMetadataSchema } from "./asset-organization-contract";
import { getMediaAssetName, getMediaAssetDownloadName, getMediaAssetReferenceId } from "./media-asset-name";

describe("asset library metadata contract", () => {
  const asset = { id: "asset_1", type: "image" as const, createdAt: "2026-10-12T23:30:00-03:00" };
  it("keeps a stable UTC fallback and prefers user name over a known upload name", () => {
    expect(getMediaAssetName(asset)).toBe("Image 2026-10-13 asset_1");
    expect(getMediaAssetName({ ...asset, originalFileName: "원본.png" })).toBe("원본.png");
    expect(getMediaAssetName({ ...asset, originalFileName: "원본.png", displayName: "정면" })).toBe("정면");
    expect(getMediaAssetDownloadName({ ...asset, originalFileName: "원본.png", mimeType: "image/webp" })).toBe("원본.webp");
  });
  it("normalizes organization collisions and rejects deceptive control characters", () => {
    expect(normalizeAssetOrganizationName("  CAFÉ  ")).toBe(normalizeAssetOrganizationName("cafe\u0301"));
    expect(assetNameSchema.parse("  이름  ")).toBe("이름");
    for (const name of [" ", "가\u0000나", "x\u202Ey", "x\ny"]) expect(assetNameSchema.safeParse(name).success).toBe(false);
    expect(getMediaAssetDownloadName({ ...asset, displayName: "../evil\r\n.exe", mimeType: "video/mp4" })).toBe("_evil.mp4");
  });
  it("requires an explicit version and change and permits resetting metadata", () => {
    expect(updateAssetMetadataSchema.safeParse({ displayName: "name" }).success).toBe(false);
    expect(updateAssetMetadataSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(updateAssetMetadataSchema.parse({ expectedVersion: 2, displayName: null, folderId: null, tagIds: [] })).toMatchObject({ displayName: null, folderId: null, tagIds: [] });
    expect(updateAssetMetadataSchema.safeParse({ expectedVersion: 2, ownerEmail: "other@example.com", starred: true }).success).toBe(false);
  });
  it("rejects duplicate or contradictory batch changes before any write", () => {
    const batch = { assets: [{ id: "asset_1", expectedVersion: 1 }], addTagIds: ["tag_1"] };
    expect(batchAssetMetadataSchema.safeParse(batch).success).toBe(true);
    expect(batchAssetMetadataSchema.safeParse({ ...batch, removeTagIds: ["tag_1"] }).success).toBe(false);
    expect(batchAssetMetadataSchema.safeParse({ ...batch, assets: [...batch.assets, ...batch.assets] }).success).toBe(false);
    expect(updateAssetMetadataSchema.safeParse({ expectedVersion: 1, tagIds: ["tag_1", "tag_1"] }).success).toBe(false);
  });
  it("validates editable detail fields separately from identity and execution status", () => {
    expect(updateAssetMetadataSchema.parse({ expectedVersion: 1, classification: "prop", displayVersion: " v1 ", description: "line1\nline2", managementStatus: "active" })).toMatchObject({ displayVersion: "v1", classification: "prop", managementStatus: "active" });
    expect(updateAssetMetadataSchema.parse({ expectedVersion: 2, classification: null, displayVersion: null, description: null, managementStatus: null })).toMatchObject({ classification: null, description: null });
    for (const invalid of [{ id: "replacement" }, { status: "completed" }, { classification: "video" }, { managementStatus: "failed" }, { displayVersion: "v".repeat(65) }, { description: "x".repeat(2001) }, { description: "x\u0000y" }]) {
      expect(updateAssetMetadataSchema.safeParse({ expectedVersion: 1, ...invalid }).success).toBe(false);
    }
  });
  it("validates editable reference IDs while retaining an immutable file identity", () => {
    expect(updateAssetMetadataSchema.parse({ expectedVersion: 1, referenceId: " HERO_01 " })).toMatchObject({ referenceId: "HERO_01" });
    expect(updateAssetMetadataSchema.parse({ expectedVersion: 1, referenceId: null })).toMatchObject({ referenceId: null });
    for (const referenceId of ["", " ", "@hero", "a b", "a/b", "_hero", "한글", "x".repeat(129)]) {
      expect(updateAssetMetadataSchema.safeParse({ expectedVersion: 1, referenceId }).success).toBe(false);
    }
    expect(getMediaAssetReferenceId({ id: "internal", referenceId: "HERO_01" })).toBe("HERO_01");
    expect(getMediaAssetReferenceId({ id: "internal", referenceId: null })).toBe("internal");
  });
});
