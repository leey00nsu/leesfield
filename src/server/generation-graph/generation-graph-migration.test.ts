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
});
