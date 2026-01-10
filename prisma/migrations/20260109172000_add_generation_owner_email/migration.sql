-- Add ownerEmail to generations
ALTER TABLE "ImageGeneration" ADD COLUMN IF NOT EXISTS "ownerEmail" TEXT;
ALTER TABLE "VideoGeneration" ADD COLUMN IF NOT EXISTS "ownerEmail" TEXT;

-- Indexes for owner scoping
CREATE INDEX IF NOT EXISTS "ImageGeneration_ownerEmail_idx" ON "ImageGeneration"("ownerEmail");
CREATE INDEX IF NOT EXISTS "VideoGeneration_ownerEmail_idx" ON "VideoGeneration"("ownerEmail");
