-- User-approved Graph-only breaking transition. Version 0 marks only the old
-- editor rows; newly created Spaces use version 1 and survive a repeated run.
-- Existing FK CASCADE deletes graph-owned Nodes/Edges/NodeOutputs, while SET
-- NULL keeps Generation/MediaOperation history and independent MediaAssets.
BEGIN;
ALTER TABLE "GenerationGraph" ADD COLUMN IF NOT EXISTS "spaceVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GenerationGraph" ALTER COLUMN "spaceVersion" SET DEFAULT 1;
DELETE FROM "GenerationGraph" WHERE "spaceVersion" = 0;
COMMIT;
