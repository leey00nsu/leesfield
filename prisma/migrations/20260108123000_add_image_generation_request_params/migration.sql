-- Add request params json
ALTER TABLE "ImageGeneration" ADD COLUMN "requestParams" JSONB;

-- Drop legacy modal-era columns
ALTER TABLE "ImageGeneration" DROP COLUMN IF EXISTS "negativePrompt";
ALTER TABLE "ImageGeneration" DROP COLUMN IF EXISTS "cfgScale";
ALTER TABLE "ImageGeneration" DROP COLUMN IF EXISTS "sampler";
