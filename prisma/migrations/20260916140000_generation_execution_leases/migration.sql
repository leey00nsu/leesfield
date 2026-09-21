-- Shared generation execution leases.
-- Existing processing/uploading rows intentionally receive no lease. The
-- worker will settle those legacy executions to an explicit terminal state
-- before claiming new work, so a deployment cannot silently replay a paid
-- provider call with unknown remote state.
ALTER TABLE "ImageGeneration"
  ADD COLUMN "executionLeaseToken" TEXT,
  ADD COLUMN "executionLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "executionLeaseVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "VideoGeneration"
  ADD COLUMN "executionLeaseToken" TEXT,
  ADD COLUMN "executionLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "executionLeaseVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AudioGeneration"
  ADD COLUMN "executionLeaseToken" TEXT,
  ADD COLUMN "executionLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "executionLeaseVersion" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "ImageGeneration_status_executionLeaseUntil_idx"
  ON "ImageGeneration"("status", "executionLeaseUntil");
CREATE INDEX "VideoGeneration_status_executionLeaseUntil_idx"
  ON "VideoGeneration"("status", "executionLeaseUntil");
CREATE INDEX "AudioGeneration_status_executionLeaseUntil_idx"
  ON "AudioGeneration"("status", "executionLeaseUntil");
