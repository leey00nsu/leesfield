-- Derived image roles are optional; existing permanent URLs remain unchanged.
ALTER TABLE "MediaAsset" ADD COLUMN "imageVariants" JSONB;
