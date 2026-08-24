import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("generation graph migration", () => {
  it("preserves generations and outputs when graph relations are deleted", async () => {
    const migration = await readFile(
      path.join(
        process.cwd(),
        "prisma/migrations/20260824152000_add_generation_graph_domain/migration.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      'FOREIGN KEY ("graphNodeId") REFERENCES "GenerationGraphNode"("id") ON DELETE SET NULL',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("selectedOutputImageId") REFERENCES "ImageGenerationImage"("id") ON DELETE SET NULL',
    );
    expect(migration).not.toContain(
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
});
