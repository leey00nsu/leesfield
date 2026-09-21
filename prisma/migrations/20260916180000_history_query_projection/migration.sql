-- Keep the small history-card projection separate from potentially large requestParams.
ALTER TABLE "ImageGeneration" ADD COLUMN "historyMetadata" JSONB;
ALTER TABLE "VideoGeneration" ADD COLUMN "historyMetadata" JSONB;
ALTER TABLE "AudioGeneration" ADD COLUMN "historyMetadata" JSONB;

-- Backfill only fields needed by list responses. Detail/reuse continues to read requestParams.
UPDATE "ImageGeneration" AS generation
SET "historyMetadata" = jsonb_strip_nulls(jsonb_build_object(
  'graphId', generation."requestParams"->>'graphId',
  'graphNodeId', generation."requestParams"->>'graphNodeId',
  'referenceText', generation."requestParams"->>'referenceText',
  'sourceAssetIds', COALESCE((
    SELECT jsonb_agg(item.value->>'assetId' ORDER BY item.ordinality)
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(generation."requestParams"->'inputAssets') = 'array'
          THEN generation."requestParams"->'inputAssets'
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS item(value, ordinality)
    WHERE jsonb_typeof(item.value) = 'object'
      AND jsonb_typeof(item.value->'assetId') = 'string'
      AND NULLIF(item.value->>'assetId', '') IS NOT NULL
  ), '[]'::jsonb)
))
WHERE generation."requestParams" IS NOT NULL;

UPDATE "VideoGeneration" AS generation
SET "historyMetadata" = jsonb_strip_nulls(jsonb_build_object(
  'graphId', generation."requestParams"->>'graphId',
  'graphNodeId', generation."requestParams"->>'graphNodeId',
  'referenceText', generation."requestParams"->>'referenceText',
  'sourceAssetIds', COALESCE((
    SELECT jsonb_agg(item.value->>'assetId' ORDER BY item.ordinality)
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(generation."requestParams"->'inputAssets') = 'array'
          THEN generation."requestParams"->'inputAssets'
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS item(value, ordinality)
    WHERE jsonb_typeof(item.value) = 'object'
      AND jsonb_typeof(item.value->'assetId') = 'string'
      AND NULLIF(item.value->>'assetId', '') IS NOT NULL
  ), '[]'::jsonb)
))
WHERE generation."requestParams" IS NOT NULL;

UPDATE "AudioGeneration" AS generation
SET "historyMetadata" = jsonb_strip_nulls(jsonb_build_object(
  'graphId', generation."requestParams"->>'graphId',
  'graphNodeId', generation."requestParams"->>'graphNodeId',
  'referenceText', generation."requestParams"->>'referenceText',
  'sourceAssetIds', COALESCE((
    SELECT jsonb_agg(item.value->>'assetId' ORDER BY item.ordinality)
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(generation."requestParams"->'inputAssets') = 'array'
          THEN generation."requestParams"->'inputAssets'
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS item(value, ordinality)
    WHERE jsonb_typeof(item.value) = 'object'
      AND jsonb_typeof(item.value->'assetId') = 'string'
      AND NULLIF(item.value->>'assetId', '') IS NOT NULL
  ), '[]'::jsonb)
))
WHERE generation."requestParams" IS NOT NULL;

-- History ordering is owner/date/id; monitoring ordering is date/id. A single
-- B-tree supports both ASC and DESC scans.
CREATE INDEX "ImageGeneration_ownerEmail_createdAt_requestId_idx"
  ON "ImageGeneration"("ownerEmail", "createdAt", "requestId");
CREATE INDEX "ImageGeneration_ownerEmail_status_createdAt_requestId_idx"
  ON "ImageGeneration"("ownerEmail", "status", "createdAt", "requestId");
CREATE INDEX "ImageGeneration_createdAt_requestId_idx"
  ON "ImageGeneration"("createdAt", "requestId");

CREATE INDEX "VideoGeneration_ownerEmail_createdAt_requestId_idx"
  ON "VideoGeneration"("ownerEmail", "createdAt", "requestId");
CREATE INDEX "VideoGeneration_ownerEmail_status_createdAt_requestId_idx"
  ON "VideoGeneration"("ownerEmail", "status", "createdAt", "requestId");
CREATE INDEX "VideoGeneration_createdAt_requestId_idx"
  ON "VideoGeneration"("createdAt", "requestId");

CREATE INDEX "AudioGeneration_ownerEmail_createdAt_requestId_idx"
  ON "AudioGeneration"("ownerEmail", "createdAt", "requestId");
CREATE INDEX "AudioGeneration_ownerEmail_status_createdAt_requestId_idx"
  ON "AudioGeneration"("ownerEmail", "status", "createdAt", "requestId");
CREATE INDEX "AudioGeneration_createdAt_requestId_idx"
  ON "AudioGeneration"("createdAt", "requestId");

CREATE INDEX "MediaOperation_createdAt_id_idx"
  ON "MediaOperation"("createdAt", "id");
