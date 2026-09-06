import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260903185000_add_media_asset_domain/migration.sql",
  ),
  "utf8",
);
const statusMigration = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260903184500_add_generation_uploading_states/migration.sql",
  ),
  "utf8",
);

describe("MediaAsset migration", () => {
  it("adds durable asset, upload, operation, input, and NodeOutput tables", () => {
    for (const table of [
      "MediaAsset",
      "MediaUploadSession",
      "MediaOperation",
      "MediaOperationInput",
      "GenerationGraphNodeOutput",
    ]) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it("backfills only durable owner-scoped HTTP outputs and remains conflict-safe", () => {
    expect(migration.match(/"ownerEmail" IS NOT NULL/g)?.length).toBeGreaterThanOrEqual(6);
    expect(migration.match(/"url" ~ '\^https\?:\/\/'/g)?.length).toBeGreaterThanOrEqual(6);
    expect(migration.match(/ON CONFLICT \("storageProvider", "storageObjectId"\) DO NOTHING/g)).toHaveLength(3);
    expect(migration).not.toContain("data:");
  });

  it("protects every active execution kind through partial unique indexes", () => {
    for (const type of ["ImageGenerationStatus", "VideoGenerationStatus", "AudioGenerationStatus"]) {
      expect(statusMigration).toContain(`ALTER TYPE "${type}" ADD VALUE 'uploading'`);
      expect(statusMigration).toContain(`ALTER TYPE "${type}" ADD VALUE 'cancelled'`);
    }
    for (const index of [
      "ImageGeneration_one_active_per_graph_node",
      "VideoGeneration_one_active_per_graph_node",
      "AudioGeneration_one_active_per_graph_node",
      "MediaOperation_one_active_per_graph_node",
    ]) {
      expect(migration).toContain(`CREATE UNIQUE INDEX "${index}"`);
    }
    expect(
      migration.match(/WHERE "graphNodeId" IS NOT NULL AND "status" IN \('pending', 'processing', 'uploading'\)/g),
    ).toHaveLength(4);
  });

  it("preserves assets when Graphs and Nodes are deleted", () => {
    expect(migration).toContain(
      'FOREIGN KEY ("sourceOperationId") REFERENCES "MediaOperation"("id") ON DELETE SET NULL',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("selectedOutputAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL',
    );
  });
});
