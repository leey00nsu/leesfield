-- Add request params json
ALTER TABLE "ImageGeneration" ADD COLUMN "requestParams" JSONB;

-- Migrate legacy columns into requestParams if needed
UPDATE "ImageGeneration"
SET "requestParams" = COALESCE("requestParams", '{}'::jsonb) || jsonb_strip_nulls(
  jsonb_build_object(
    'negativePrompt', "negativePrompt",
    'cfgScale', "cfgScale",
    'sampler', "sampler"
  )
)
WHERE ("requestParams" IS NULL OR "requestParams" = '{}'::jsonb)
  AND ("negativePrompt" IS NOT NULL OR "cfgScale" IS NOT NULL OR "sampler" IS NOT NULL);

-- Drop legacy modal-era columns
ALTER TABLE "ImageGeneration" DROP COLUMN IF EXISTS "negativePrompt";
ALTER TABLE "ImageGeneration" DROP COLUMN IF EXISTS "cfgScale";
ALTER TABLE "ImageGeneration" DROP COLUMN IF EXISTS "sampler";
