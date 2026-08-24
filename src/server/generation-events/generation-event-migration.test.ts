import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "prisma/migrations/20260824215000_generation_event_notify/migration.sql",
);

describe("generation event migration", () => {
  it("publishes Node-linked insert and status/progress updates after the row write", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain(
      'AFTER INSERT OR UPDATE OF "status", "progress", "graphNodeId"',
    );
    expect(migration).toContain("FOR EACH ROW");
    expect(migration).toContain(
      "pg_notify('leesfield_generation_events_v1', event_payload::TEXT)",
    );
    expect(migration).toContain('NEW."graphNodeId" IS NULL');
    expect(migration).toContain('NEW."status" IS NOT DISTINCT FROM OLD."status"');
    expect(migration).toContain(
      'NEW."progress" IS NOT DISTINCT FROM OLD."progress"',
    );
  });

  it("resolves the Graph relation and emits only the versioned minimal contract", async () => {
    const migration = await readFile(migrationPath, "utf8");

    for (const field of [
      "version",
      "type",
      "graphId",
      "graphNodeId",
      "requestId",
      "status",
      "progress",
      "updatedAt",
    ]) {
      expect(migration).toContain(`'${field}'`);
    }

    expect(migration).toContain('FROM "GenerationGraphNode"');
    expect(migration).not.toContain("'ownerEmail'");
    expect(migration).not.toContain("'prompt'");
    expect(migration).not.toContain("'requestParams'");
    expect(migration).not.toContain("'errorMessage'");
    expect(migration).not.toContain("'images'");
  });
});
