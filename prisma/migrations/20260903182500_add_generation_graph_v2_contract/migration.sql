-- Add the engine-neutral Graph v2 compatibility columns without dropping any
-- v1 data. Existing Graphs remain v1 until a writerVersion=2 save succeeds.
ALTER TABLE "GenerationGraph"
  ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "minimumWriterVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "GenerationGraphNode"
  ALTER COLUMN "type" DROP NOT NULL,
  ADD COLUMN "kind" TEXT,
  ADD COLUMN "selectedOutputAssetId" TEXT;

ALTER TABLE "GenerationGraphEdge"
  ALTER COLUMN "kind" DROP NOT NULL,
  ADD COLUMN "sourcePortId" TEXT,
  ADD COLUMN "targetPortId" TEXT,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Idempotent compatibility projection. These values do not upgrade the Graph;
-- they only make v1 rows readable through the canonical adapter.
UPDATE "GenerationGraphNode"
SET "kind" = 'generate.image'
WHERE "kind" IS NULL AND "type" = 'imageGeneration';

UPDATE "GenerationGraphEdge"
SET
  "sourcePortId" = 'image',
  "targetPortId" = CASE
    WHEN "kind" = 'primary' THEN 'primary'
    ELSE 'references'
  END
WHERE "sourcePortId" IS NULL OR "targetPortId" IS NULL;

WITH ordered_references AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "graphId", "targetNodeId", "targetPortId"
      ORDER BY "createdAt", "id"
    ) - 1 AS "position"
  FROM "GenerationGraphEdge"
  WHERE "kind" = 'reference'
)
UPDATE "GenerationGraphEdge" AS edge
SET "sortOrder" = ordered_references."position"
FROM ordered_references
WHERE edge."id" = ordered_references."id";

CREATE INDEX "GenerationGraphNode_kind_idx"
  ON "GenerationGraphNode"("kind");
CREATE INDEX "GenerationGraphNode_selectedOutputAssetId_idx"
  ON "GenerationGraphNode"("selectedOutputAssetId");
CREATE UNIQUE INDEX "GenerationGraphEdge_graphId_sourceNodeId_sourcePortId_targetNodeId_targetPortId_sortOrder_key"
  ON "GenerationGraphEdge"("graphId", "sourceNodeId", "sourcePortId", "targetNodeId", "targetPortId", "sortOrder");
