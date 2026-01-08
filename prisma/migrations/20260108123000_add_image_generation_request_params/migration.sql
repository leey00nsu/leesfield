-- NOTE: Take a full database backup before running this migration in production.
-- Add request params json
ALTER TABLE "ImageGeneration" ADD COLUMN IF NOT EXISTS "requestParams" JSONB;

-- Migrate legacy columns into requestParams if needed
UPDATE "ImageGeneration"
SET "requestParams" = COALESCE("requestParams", '{}'::jsonb) || jsonb_strip_nulls(
  jsonb_build_object(
    'negativePrompt', "negativePrompt",
    'cfgScale', "cfgScale",
    'sampler', "sampler"
  )
)
WHERE "negativePrompt" IS NOT NULL OR "cfgScale" IS NOT NULL OR "sampler" IS NOT NULL;

-- Ensure requestParams is non-null for legacy rows
UPDATE "ImageGeneration"
SET "requestParams" = '{}'::jsonb
WHERE "requestParams" IS NULL;

-- Validate migration before dropping legacy columns.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ImageGeneration"
    WHERE (
      ("negativePrompt" IS NOT NULL AND NOT ("requestParams" ? 'negativePrompt')) OR
      ("cfgScale" IS NOT NULL AND NOT ("requestParams" ? 'cfgScale')) OR
      ("sampler" IS NOT NULL AND NOT ("requestParams" ? 'sampler'))
    )
  ) THEN
    RAISE EXCEPTION 'Legacy request params were not fully migrated into requestParams.';
  END IF;
END $$;

-- Drop legacy modal-era columns
ALTER TABLE "ImageGeneration" DROP COLUMN IF EXISTS "negativePrompt";
ALTER TABLE "ImageGeneration" DROP COLUMN IF EXISTS "cfgScale";
ALTER TABLE "ImageGeneration" DROP COLUMN IF EXISTS "sampler";
