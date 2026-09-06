import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "prisma/migrations/20260904093000_break_generation_graph_v2_cutover/migration.sql",
);

describe("v2-only node execution event migration", () => {
  it("removes the v1 trigger and publishes all execution kinds on the v2 channel", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain('DROP TRIGGER IF EXISTS "ImageGeneration_notify_node_generation_updated"');
    expect(migration).toContain('DROP FUNCTION IF EXISTS "notify_node_generation_updated"()');
    for (const trigger of [
      "ImageGeneration_notify_node_execution_updated_v2",
      "VideoGeneration_notify_node_execution_updated_v2",
      "AudioGeneration_notify_node_execution_updated_v2",
      "MediaOperation_notify_node_execution_updated_v2",
    ]) {
      expect(migration).toContain(`CREATE TRIGGER "${trigger}"`);
    }
    expect(migration).toContain("pg_notify('leesfield_node_execution_events_v2', event_payload::TEXT)");
    expect(migration).not.toContain("pg_notify('leesfield_generation_events_v1', event_payload::TEXT)");
  });

  it("keeps the v2 notification payload minimal", async () => {
    const migration = await readFile(migrationPath, "utf8");

    for (const field of [
      "version",
      "type",
      "executionKind",
      "mediaType",
      "graphId",
      "graphNodeId",
      "executionId",
      "status",
      "progress",
      "updatedAt",
    ]) {
      expect(migration).toContain(`'${field}'`);
    }
    for (const sensitive of [
      "'ownerEmail'",
      "'prompt'",
      "'parameters'",
      "'requestParams'",
      "'errorMessage'",
      "'storageUrl'",
      "'assetUrl'",
    ]) {
      expect(migration).not.toContain(sensitive);
    }
  });
});
