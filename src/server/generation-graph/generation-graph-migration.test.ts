// @vitest-environment node
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import path from "node:path";

import { describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env")) loadEnvFile(".env");

describe("generation graph migration", () => {
  it.skipIf(!process.env.DATABASE_URL)("adds v3 groups without resetting Spaces and blocks old-writer downgrades", async () => {
    const schema = `space_groups_${randomUUID().replaceAll("-", "")}`;
    const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await client.query(`CREATE TABLE "GenerationGraph" (id text PRIMARY KEY, "schemaVersion" integer NOT NULL DEFAULT 2,
        "minimumWriterVersion" integer NOT NULL DEFAULT 2, version integer NOT NULL DEFAULT 1);
        INSERT INTO "GenerationGraph" (id, version) VALUES ('existing-space', 17);`);
      const sql = await readFile(path.join(process.cwd(), "prisma/migrations/20260905190000_space_groups_v3/migration.sql"), "utf8");
      await client.query(sql);
      expect((await client.query('SELECT * FROM "GenerationGraph"')).rows).toEqual([
        { id: "existing-space", schemaVersion: 2, minimumWriterVersion: 2, version: 17, groups: [] },
      ]);
      await client.query('INSERT INTO "GenerationGraph" (id) VALUES (\'new-space\')');
      expect((await client.query('SELECT * FROM "GenerationGraph" WHERE id = \'new-space\'')).rows[0])
        .toMatchObject({ schemaVersion: 3, minimumWriterVersion: 3, groups: [] });
      await client.query('UPDATE "GenerationGraph" SET "schemaVersion" = 3, "minimumWriterVersion" = 3, groups = $1 WHERE id = $2',
        [JSON.stringify([{ id: "frame" }]), "existing-space"]);
      await expect(client.query('UPDATE "GenerationGraph" SET "schemaVersion" = 2, "minimumWriterVersion" = 2, groups = \'[]\' WHERE id = \'existing-space\''))
        .rejects.toThrow("SPACE_WRITER_DOWNGRADE");
      expect((await client.query('SELECT * FROM "GenerationGraph" WHERE id = \'existing-space\'')).rows[0])
        .toMatchObject({ version: 17, groups: [{ id: "frame" }] });
    } finally {
      await client.query("SET search_path TO public");
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
  it.skipIf(!process.env.DATABASE_URL)("executes the Spaces cutover in an isolated PostgreSQL schema without losing history", async () => {
    const schema = `spaces_cutover_${randomUUID().replaceAll("-", "")}`;
    const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await client.query(`
        CREATE TABLE "GenerationGraph" (id text PRIMARY KEY);
        CREATE TABLE "GenerationGraphNode" (id text PRIMARY KEY, "graphId" text REFERENCES "GenerationGraph"(id) ON DELETE CASCADE);
        CREATE TABLE "MediaAsset" (id text PRIMARY KEY);
        CREATE TABLE "GenerationGraphNodeOutput" (id text PRIMARY KEY, "graphNodeId" text REFERENCES "GenerationGraphNode"(id) ON DELETE CASCADE, "assetId" text REFERENCES "MediaAsset"(id) ON DELETE RESTRICT);
        INSERT INTO "GenerationGraph" VALUES ('old');
        INSERT INTO "GenerationGraphNode" VALUES ('old-node', 'old');
        INSERT INTO "MediaAsset" VALUES ('retained-asset');
        INSERT INTO "GenerationGraphNodeOutput" VALUES ('binding', 'old-node', 'retained-asset');
      `);
      for (const table of ["ImageGeneration", "VideoGeneration", "AudioGeneration", "MediaOperation"]) {
        await client.query(`CREATE TABLE "${table}" (id text PRIMARY KEY, "graphNodeId" text REFERENCES "GenerationGraphNode"(id) ON DELETE SET NULL, status text);
          INSERT INTO "${table}" VALUES ('history', 'old-node', 'completed'), ('active', 'old-node', 'processing')`);
      }
      const sql = await readFile(path.join(process.cwd(), "prisma/migrations/20260905100000_spaces_breaking_cutover/migration.sql"), "utf8");
      await client.query(sql);
      expect((await client.query('SELECT * FROM "GenerationGraph"')).rows).toHaveLength(0);
      expect((await client.query('SELECT * FROM "GenerationGraphNode"')).rows).toHaveLength(0);
      expect((await client.query('SELECT * FROM "GenerationGraphNodeOutput"')).rows).toHaveLength(0);
      expect((await client.query('SELECT * FROM "MediaAsset"')).rows).toHaveLength(1);
      for (const table of ["ImageGeneration", "VideoGeneration", "AudioGeneration", "MediaOperation"]) {
        const rows = (await client.query(`SELECT * FROM "${table}"`)).rows;
        expect(rows).toHaveLength(2); expect(rows.every((row) => row.graphNodeId === null)).toBe(true);
      }
      await client.query('INSERT INTO "GenerationGraph" (id) VALUES (\'new-space\')');
      await client.query(sql);
      expect((await client.query('SELECT * FROM "GenerationGraph"')).rows).toEqual([{ id: "new-space", spaceVersion: 1 }]);
    } finally {
      await client.query("ROLLBACK");
      await client.query("SET search_path TO public");
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
  it("only removes pre-Spaces rows and preserves new Spaces on repeat", async () => {
    const migration = await readFile(path.join(process.cwd(), "prisma/migrations/20260905100000_spaces_breaking_cutover/migration.sql"), "utf8");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "spaceVersion" INTEGER NOT NULL DEFAULT 0');
    expect(migration).toContain('ALTER COLUMN "spaceVersion" SET DEFAULT 1');
    expect(migration).toContain('DELETE FROM "GenerationGraph" WHERE "spaceVersion" = 0');
    for (const table of ["ImageGeneration", "VideoGeneration", "AudioGeneration", "MediaAsset", "MediaOperation"]) {
      expect(migration).not.toContain(`DELETE FROM "${table}"`);
    }
  });
  it("preserves Generation and MediaOperation records through SetNull relations", async () => {
    const graphMigration = await readFile(
      path.join(
        process.cwd(),
        "prisma/migrations/20260824152000_add_generation_graph_domain/migration.sql",
      ),
      "utf8",
    );

    const mediaMigration = await readFile(
      path.join(
        process.cwd(),
        "prisma/migrations/20260903185000_add_media_asset_domain/migration.sql",
      ),
      "utf8",
    );

    expect(graphMigration).toContain(
      'FOREIGN KEY ("graphNodeId") REFERENCES "GenerationGraphNode"("id") ON DELETE SET NULL',
    );
    expect(mediaMigration).toContain(
      'FOREIGN KEY ("graphId") REFERENCES "GenerationGraph"("id") ON DELETE SET NULL',
    );
    expect(mediaMigration).toContain(
      'FOREIGN KEY ("graphNodeId") REFERENCES "GenerationGraphNode"("id") ON DELETE SET NULL',
    );
    expect(graphMigration).not.toContain(
      'FOREIGN KEY ("graphNodeId") REFERENCES "GenerationGraphNode"("id") ON DELETE CASCADE',
    );
  });

  it("allows one active generation per graph node without limiting terminal history", async () => {
    const migration = await readFile(
      path.join(
        process.cwd(),
        "prisma/migrations/20260824203000_active_node_generation/migration.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      'CREATE UNIQUE INDEX "ImageGeneration_one_active_per_graph_node"',
    );
    expect(migration).toContain('ON "ImageGeneration"("graphNodeId")');
    expect(migration).toContain('WHERE "graphNodeId" IS NOT NULL');
    expect(migration).toContain("\"status\" IN ('pending', 'processing')");
    expect(migration).not.toContain("'completed'");
    expect(migration).not.toContain("'failed'");
  });

  it("deletes Graph test data and removes the legacy schema in the breaking cutover", async () => {
    const migration = await readFile(
      path.join(
        process.cwd(),
        "prisma/migrations/20260904093000_break_generation_graph_v2_cutover/migration.sql",
      ),
      "utf8",
    );

    expect(migration).toContain('DELETE FROM "GenerationGraph"');
    expect(migration).toContain('DROP COLUMN "type"');
    expect(migration).toContain('DROP COLUMN "selectedOutputImageId"');
    expect(migration).toContain('DROP COLUMN "kind"');
    expect(migration).toContain('DROP COLUMN "sourceHandle"');
    expect(migration).toContain('DROP COLUMN "targetHandle"');
    expect(migration).toContain('ALTER COLUMN "schemaVersion" SET DEFAULT 2');
    expect(migration).toContain('ALTER COLUMN "minimumWriterVersion" SET DEFAULT 2');
    expect(migration).not.toContain('DELETE FROM "ImageGeneration"');
    expect(migration).not.toContain('DELETE FROM "VideoGeneration"');
    expect(migration).not.toContain('DELETE FROM "AudioGeneration"');
    expect(migration).not.toContain('DELETE FROM "MediaAsset"');
    expect(migration).not.toContain('DELETE FROM "MediaOperation"');
  });
});
