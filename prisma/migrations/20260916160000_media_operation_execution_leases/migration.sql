ALTER TABLE "MediaOperation"
  ADD COLUMN "executionLeaseToken" TEXT,
  ADD COLUMN "executionLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "executionLeaseVersion" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "MediaOperation_status_executionLeaseUntil_idx"
  ON "MediaOperation"("status", "executionLeaseUntil");
