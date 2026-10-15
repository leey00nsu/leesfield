ALTER TABLE "MediaAsset" ADD COLUMN "referenceId" TEXT;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_referenceId_format"
  CHECK ("referenceId" IS NULL OR "referenceId" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$');
CREATE UNIQUE INDEX "MediaAsset_ownerEmail_referenceId_key" ON "MediaAsset"("ownerEmail", "referenceId");
