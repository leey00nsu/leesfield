-- Durable storage deletion intents close the remote-storage/DB transaction
-- gap for uploads, generated outputs, and history deletion.
CREATE TYPE "MediaCleanupTaskStatus" AS ENUM (
  'uploading',
  'pending',
  'processing',
  'linked',
  'completed',
  'failed'
);

CREATE TABLE "MediaCleanupTask" (
  "id" TEXT NOT NULL,
  "ownerEmail" TEXT,
  "requestId" TEXT,
  "storageProvider" TEXT NOT NULL,
  "storageObjectId" TEXT NOT NULL,
  "storageUrl" TEXT,
  "reason" TEXT NOT NULL,
  "assetId" TEXT,
  "status" "MediaCleanupTaskStatus" NOT NULL DEFAULT 'uploading',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "retryAt" TIMESTAMP(3) NOT NULL,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaCleanupTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaCleanupTask_storageProvider_storageObjectId_key"
  ON "MediaCleanupTask"("storageProvider", "storageObjectId");
CREATE INDEX "MediaCleanupTask_status_retryAt_idx"
  ON "MediaCleanupTask"("status", "retryAt");
CREATE INDEX "MediaCleanupTask_requestId_status_idx"
  ON "MediaCleanupTask"("requestId", "status");
CREATE INDEX "MediaCleanupTask_assetId_status_idx"
  ON "MediaCleanupTask"("assetId", "status");

ALTER TABLE "MediaCleanupTask"
  ADD CONSTRAINT "MediaCleanupTask_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
