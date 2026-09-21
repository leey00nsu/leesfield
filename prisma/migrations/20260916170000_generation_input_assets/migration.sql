-- Durable references from generation requests to uploaded input assets.
CREATE TABLE "GenerationInputAsset" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "generationType" "MediaType" NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GenerationInputAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GenerationInputAsset_requestId_generationType_field_sortOrder_key"
  ON "GenerationInputAsset"("requestId", "generationType", "field", "sortOrder");
CREATE INDEX "GenerationInputAsset_assetId_idx" ON "GenerationInputAsset"("assetId");
CREATE INDEX "GenerationInputAsset_ownerEmail_generationType_requestId_idx"
  ON "GenerationInputAsset"("ownerEmail", "generationType", "requestId");
ALTER TABLE "GenerationInputAsset"
  ADD CONSTRAINT "GenerationInputAsset_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
