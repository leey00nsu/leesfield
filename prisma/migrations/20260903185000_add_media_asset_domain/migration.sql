-- Multi-media asset and execution persistence additions.
CREATE TYPE "MediaType" AS ENUM ('image', 'audio', 'video');
CREATE TYPE "MediaAssetStatus" AS ENUM ('completed', 'deleting', 'failed');
CREATE TYPE "MediaAssetOrigin" AS ENUM ('upload', 'generation', 'media_operation', 'legacy_generation');
CREATE TYPE "MediaUploadSessionStatus" AS ENUM ('pending', 'confirming', 'completed', 'expired', 'failed');
CREATE TYPE "MediaOperationStatus" AS ENUM ('pending', 'processing', 'uploading', 'completed', 'failed', 'cancelled');

ALTER TABLE "ImageGeneration" ADD COLUMN "cancelRequestedAt" TIMESTAMP(3);
ALTER TABLE "VideoGeneration"
  ADD COLUMN "cancelRequestedAt" TIMESTAMP(3),
  ADD COLUMN "graphNodeId" TEXT;
ALTER TABLE "AudioGeneration"
  ADD COLUMN "cancelRequestedAt" TIMESTAMP(3),
  ADD COLUMN "graphNodeId" TEXT;

ALTER TABLE "ImageGenerationImage" ADD COLUMN "assetId" TEXT;
ALTER TABLE "VideoGenerationVideo" ADD COLUMN "assetId" TEXT;
ALTER TABLE "AudioGenerationAudio" ADD COLUMN "assetId" TEXT;

CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "ownerEmail" TEXT NOT NULL,
  "type" "MediaType" NOT NULL,
  "status" "MediaAssetStatus" NOT NULL DEFAULT 'completed',
  "origin" "MediaAssetOrigin" NOT NULL,
  "storageProvider" TEXT NOT NULL,
  "storageObjectId" TEXT NOT NULL,
  "storageUrl" TEXT,
  "legacyUrl" TEXT,
  "mimeType" TEXT NOT NULL,
  "bytes" BIGINT,
  "width" INTEGER,
  "height" INTEGER,
  "durationMs" INTEGER,
  "sourceOperationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaOperation" (
  "id" TEXT NOT NULL,
  "ownerEmail" TEXT NOT NULL,
  "graphId" TEXT,
  "graphNodeId" TEXT,
  "type" TEXT NOT NULL,
  "configVersion" INTEGER NOT NULL,
  "parameters" JSONB NOT NULL,
  "status" "MediaOperationStatus" NOT NULL DEFAULT 'pending',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "expectedOutputCount" INTEGER NOT NULL DEFAULT 1,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "MediaOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaUploadSession" (
  "id" TEXT NOT NULL,
  "ownerEmail" TEXT NOT NULL,
  "intendedType" "MediaType" NOT NULL,
  "fileName" TEXT NOT NULL,
  "declaredMimeType" TEXT NOT NULL,
  "declaredBytes" BIGINT NOT NULL,
  "storageProvider" TEXT NOT NULL,
  "storageObjectId" TEXT NOT NULL,
  "storageObjectName" TEXT NOT NULL,
  "storageUrl" TEXT NOT NULL,
  "operationId" TEXT,
  "outputPortId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "MediaUploadSessionStatus" NOT NULL DEFAULT 'pending',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "assetId" TEXT,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaUploadSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GenerationGraphNodeOutput" (
  "id" TEXT NOT NULL,
  "graphNodeId" TEXT NOT NULL,
  "portId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GenerationGraphNodeOutput_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaOperationInput" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "portId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "MediaOperationInput_pkey" PRIMARY KEY ("id")
);

-- The conflict target must exist before the idempotent legacy backfill starts.
CREATE UNIQUE INDEX "MediaAsset_storageProvider_storageObjectId_key" ON "MediaAsset"("storageProvider", "storageObjectId");

-- Lossless, idempotent backfill for durable owner-scoped legacy generation URLs.
INSERT INTO "MediaAsset" (
  "id", "ownerEmail", "type", "status", "origin", "storageProvider",
  "storageObjectId", "storageUrl", "legacyUrl", "mimeType", "width", "height",
  "createdAt", "updatedAt"
)
SELECT
  'legacy_image_' || md5(image."id"), generation."ownerEmail", 'image', 'completed',
  'legacy_generation', 'legacy_url', 'image:' || image."id", image."url", image."url",
  CASE
    WHEN lower(image."url") ~ '\.png($|\?)' THEN 'image/png'
    WHEN lower(image."url") ~ '\.(jpg|jpeg)($|\?)' THEN 'image/jpeg'
    WHEN lower(image."url") ~ '\.webp($|\?)' THEN 'image/webp'
    WHEN lower(image."url") ~ '\.gif($|\?)' THEN 'image/gif'
    ELSE 'application/octet-stream'
  END,
  image."width", image."height", image."createdAt", image."createdAt"
FROM "ImageGenerationImage" image
JOIN "ImageGeneration" generation ON generation."id" = image."generationId"
WHERE generation."ownerEmail" IS NOT NULL AND image."url" ~ '^https?://'
ON CONFLICT ("storageProvider", "storageObjectId") DO NOTHING;

INSERT INTO "MediaAsset" (
  "id", "ownerEmail", "type", "status", "origin", "storageProvider",
  "storageObjectId", "storageUrl", "legacyUrl", "mimeType", "width", "height",
  "durationMs", "createdAt", "updatedAt"
)
SELECT
  'legacy_video_' || md5(video."id"), generation."ownerEmail", 'video', 'completed',
  'legacy_generation', 'legacy_url', 'video:' || video."id", video."url", video."url",
  CASE
    WHEN lower(video."url") ~ '\.webm($|\?)' THEN 'video/webm'
    WHEN lower(video."url") ~ '\.mov($|\?)' THEN 'video/quicktime'
    ELSE 'video/mp4'
  END,
  video."width", video."height",
  CASE WHEN video."durationSec" IS NULL THEN NULL ELSE video."durationSec" * 1000 END,
  video."createdAt", video."createdAt"
FROM "VideoGenerationVideo" video
JOIN "VideoGeneration" generation ON generation."id" = video."generationId"
WHERE generation."ownerEmail" IS NOT NULL AND video."url" ~ '^https?://'
ON CONFLICT ("storageProvider", "storageObjectId") DO NOTHING;

INSERT INTO "MediaAsset" (
  "id", "ownerEmail", "type", "status", "origin", "storageProvider",
  "storageObjectId", "storageUrl", "legacyUrl", "mimeType", "durationMs",
  "createdAt", "updatedAt"
)
SELECT
  'legacy_audio_' || md5(audio."id"), generation."ownerEmail", 'audio', 'completed',
  'legacy_generation', 'legacy_url', 'audio:' || audio."id", audio."url", audio."url",
  CASE
    WHEN lower(audio."url") ~ '\.wav($|\?)' THEN 'audio/wav'
    WHEN lower(audio."url") ~ '\.ogg($|\?)' THEN 'audio/ogg'
    WHEN lower(audio."url") ~ '\.flac($|\?)' THEN 'audio/flac'
    ELSE 'audio/mpeg'
  END,
  CASE WHEN audio."durationSec" IS NULL THEN NULL ELSE audio."durationSec" * 1000 END,
  audio."createdAt", audio."createdAt"
FROM "AudioGenerationAudio" audio
JOIN "AudioGeneration" generation ON generation."id" = audio."generationId"
WHERE generation."ownerEmail" IS NOT NULL AND audio."url" ~ '^https?://'
ON CONFLICT ("storageProvider", "storageObjectId") DO NOTHING;

UPDATE "ImageGenerationImage" image
SET "assetId" = 'legacy_image_' || md5(image."id")
FROM "ImageGeneration" generation
WHERE generation."id" = image."generationId"
  AND generation."ownerEmail" IS NOT NULL
  AND image."url" ~ '^https?://'
  AND image."assetId" IS NULL;

UPDATE "VideoGenerationVideo" video
SET "assetId" = 'legacy_video_' || md5(video."id")
FROM "VideoGeneration" generation
WHERE generation."id" = video."generationId"
  AND generation."ownerEmail" IS NOT NULL
  AND video."url" ~ '^https?://'
  AND video."assetId" IS NULL;

UPDATE "AudioGenerationAudio" audio
SET "assetId" = 'legacy_audio_' || md5(audio."id")
FROM "AudioGeneration" generation
WHERE generation."id" = audio."generationId"
  AND generation."ownerEmail" IS NOT NULL
  AND audio."url" ~ '^https?://'
  AND audio."assetId" IS NULL;

UPDATE "GenerationGraphNode" node
SET "selectedOutputAssetId" = image."assetId"
FROM "ImageGenerationImage" image
WHERE node."selectedOutputImageId" = image."id"
  AND image."assetId" IS NOT NULL
  AND node."selectedOutputAssetId" IS NULL;

CREATE UNIQUE INDEX "ImageGenerationImage_assetId_key" ON "ImageGenerationImage"("assetId");
CREATE UNIQUE INDEX "VideoGenerationVideo_assetId_key" ON "VideoGenerationVideo"("assetId");
CREATE UNIQUE INDEX "AudioGenerationAudio_assetId_key" ON "AudioGenerationAudio"("assetId");
CREATE INDEX "MediaAsset_ownerEmail_type_status_createdAt_idx" ON "MediaAsset"("ownerEmail", "type", "status", "createdAt");
CREATE INDEX "MediaAsset_sourceOperationId_idx" ON "MediaAsset"("sourceOperationId");
CREATE UNIQUE INDEX "MediaUploadSession_storageObjectId_key" ON "MediaUploadSession"("storageObjectId");
CREATE UNIQUE INDEX "MediaUploadSession_assetId_key" ON "MediaUploadSession"("assetId");
CREATE INDEX "MediaUploadSession_ownerEmail_status_expiresAt_idx" ON "MediaUploadSession"("ownerEmail", "status", "expiresAt");
CREATE INDEX "MediaUploadSession_operationId_idx" ON "MediaUploadSession"("operationId");
CREATE INDEX "MediaUploadSession_assetId_idx" ON "MediaUploadSession"("assetId");
CREATE UNIQUE INDEX "GenerationGraphNodeOutput_graphNodeId_portId_sortOrder_key" ON "GenerationGraphNodeOutput"("graphNodeId", "portId", "sortOrder");
CREATE INDEX "GenerationGraphNodeOutput_assetId_idx" ON "GenerationGraphNodeOutput"("assetId");
CREATE INDEX "MediaOperation_ownerEmail_status_createdAt_idx" ON "MediaOperation"("ownerEmail", "status", "createdAt");
CREATE INDEX "MediaOperation_graphId_graphNodeId_createdAt_idx" ON "MediaOperation"("graphId", "graphNodeId", "createdAt");
CREATE UNIQUE INDEX "MediaOperation_one_active_per_graph_node"
  ON "MediaOperation"("graphNodeId")
  WHERE "graphNodeId" IS NOT NULL AND "status" IN ('pending', 'processing', 'uploading');
CREATE UNIQUE INDEX "MediaOperationInput_operationId_portId_sortOrder_key" ON "MediaOperationInput"("operationId", "portId", "sortOrder");
CREATE INDEX "MediaOperationInput_assetId_idx" ON "MediaOperationInput"("assetId");
CREATE INDEX "VideoGeneration_graphNodeId_createdAt_idx" ON "VideoGeneration"("graphNodeId", "createdAt");
CREATE INDEX "AudioGeneration_graphNodeId_createdAt_idx" ON "AudioGeneration"("graphNodeId", "createdAt");
DROP INDEX "ImageGeneration_one_active_per_graph_node";
CREATE UNIQUE INDEX "ImageGeneration_one_active_per_graph_node"
  ON "ImageGeneration"("graphNodeId")
  WHERE "graphNodeId" IS NOT NULL AND "status" IN ('pending', 'processing', 'uploading');
CREATE UNIQUE INDEX "VideoGeneration_one_active_per_graph_node"
  ON "VideoGeneration"("graphNodeId")
  WHERE "graphNodeId" IS NOT NULL AND "status" IN ('pending', 'processing', 'uploading');
CREATE UNIQUE INDEX "AudioGeneration_one_active_per_graph_node"
  ON "AudioGeneration"("graphNodeId")
  WHERE "graphNodeId" IS NOT NULL AND "status" IN ('pending', 'processing', 'uploading');

ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_sourceOperationId_fkey"
  FOREIGN KEY ("sourceOperationId") REFERENCES "MediaOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaUploadSession" ADD CONSTRAINT "MediaUploadSession_operationId_fkey"
  FOREIGN KEY ("operationId") REFERENCES "MediaOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaUploadSession" ADD CONSTRAINT "MediaUploadSession_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GenerationGraphNodeOutput" ADD CONSTRAINT "GenerationGraphNodeOutput_graphNodeId_fkey"
  FOREIGN KEY ("graphNodeId") REFERENCES "GenerationGraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GenerationGraphNodeOutput" ADD CONSTRAINT "GenerationGraphNodeOutput_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MediaOperation" ADD CONSTRAINT "MediaOperation_graphId_fkey"
  FOREIGN KEY ("graphId") REFERENCES "GenerationGraph"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaOperation" ADD CONSTRAINT "MediaOperation_graphNodeId_fkey"
  FOREIGN KEY ("graphNodeId") REFERENCES "GenerationGraphNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaOperationInput" ADD CONSTRAINT "MediaOperationInput_operationId_fkey"
  FOREIGN KEY ("operationId") REFERENCES "MediaOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaOperationInput" ADD CONSTRAINT "MediaOperationInput_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GenerationGraphNode" ADD CONSTRAINT "GenerationGraphNode_selectedOutputAssetId_fkey"
  FOREIGN KEY ("selectedOutputAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImageGenerationImage" ADD CONSTRAINT "ImageGenerationImage_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VideoGenerationVideo" ADD CONSTRAINT "VideoGenerationVideo_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AudioGenerationAudio" ADD CONSTRAINT "AudioGenerationAudio_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VideoGeneration" ADD CONSTRAINT "VideoGeneration_graphNodeId_fkey"
  FOREIGN KEY ("graphNodeId") REFERENCES "GenerationGraphNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AudioGeneration" ADD CONSTRAINT "AudioGeneration_graphNodeId_fkey"
  FOREIGN KEY ("graphNodeId") REFERENCES "GenerationGraphNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
