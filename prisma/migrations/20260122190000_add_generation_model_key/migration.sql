-- AlterTable
ALTER TABLE "ImageGeneration" ADD COLUMN "modelKey" TEXT;

-- AlterTable
ALTER TABLE "VideoGeneration" ADD COLUMN "modelKey" TEXT;

-- Backfill modelKey from requestParams
UPDATE "ImageGeneration"
SET "modelKey" = "requestParams"->>'model'
WHERE "modelKey" IS NULL;

UPDATE "VideoGeneration"
SET "modelKey" = "requestParams"->>'model'
WHERE "modelKey" IS NULL;

-- CreateIndex
CREATE INDEX "ImageGeneration_status_modelKey_idx" ON "ImageGeneration"("status", "modelKey");

-- CreateIndex
CREATE INDEX "VideoGeneration_status_modelKey_idx" ON "VideoGeneration"("status", "modelKey");
