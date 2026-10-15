-- AlterTable
ALTER TABLE "ImageGeneration" ADD COLUMN     "hiddenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "VideoGeneration" ADD COLUMN     "hiddenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AudioGeneration" ADD COLUMN     "hiddenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "folderId" TEXT,
ADD COLUMN     "originalFileName" TEXT,
ADD COLUMN     "starred" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MediaOperation" ADD COLUMN     "hiddenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AssetFolder" (
    "id" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentId" TEXT,
    "parentKey" TEXT NOT NULL DEFAULT 'root',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetTag" (
    "id" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetTagAssignment" (
    "assetId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetTagAssignment_pkey" PRIMARY KEY ("assetId","tagId")
);

-- CreateIndex
CREATE INDEX "AssetFolder_ownerEmail_parentId_idx" ON "AssetFolder"("ownerEmail", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetFolder_id_ownerEmail_key" ON "AssetFolder"("id", "ownerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "AssetFolder_ownerEmail_parentKey_normalizedName_key" ON "AssetFolder"("ownerEmail", "parentKey", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "AssetTag_id_ownerEmail_key" ON "AssetTag"("id", "ownerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "AssetTag_ownerEmail_normalizedName_key" ON "AssetTag"("ownerEmail", "normalizedName");

-- CreateIndex
CREATE INDEX "AssetTagAssignment_ownerEmail_tagId_assetId_idx" ON "AssetTagAssignment"("ownerEmail", "tagId", "assetId");

-- CreateIndex
CREATE INDEX "MediaAsset_ownerEmail_folderId_status_createdAt_id_idx" ON "MediaAsset"("ownerEmail", "folderId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "MediaAsset_ownerEmail_starred_status_createdAt_id_idx" ON "MediaAsset"("ownerEmail", "starred", "status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_id_ownerEmail_key" ON "MediaAsset"("id", "ownerEmail");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_folderId_ownerEmail_fkey" FOREIGN KEY ("folderId", "ownerEmail") REFERENCES "AssetFolder"("id", "ownerEmail") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AssetFolder" ADD CONSTRAINT "AssetFolder_parentId_ownerEmail_fkey" FOREIGN KEY ("parentId", "ownerEmail") REFERENCES "AssetFolder"("id", "ownerEmail") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AssetTagAssignment" ADD CONSTRAINT "AssetTagAssignment_assetId_ownerEmail_fkey" FOREIGN KEY ("assetId", "ownerEmail") REFERENCES "MediaAsset"("id", "ownerEmail") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AssetTagAssignment" ADD CONSTRAINT "AssetTagAssignment_tagId_ownerEmail_fkey" FOREIGN KEY ("tagId", "ownerEmail") REFERENCES "AssetTag"("id", "ownerEmail") ON DELETE CASCADE ON UPDATE RESTRICT;


-- Keep the root uniqueness sentinel consistent with the actual hierarchy.
ALTER TABLE "AssetFolder" ADD CONSTRAINT "AssetFolder_parent_key_check"
  CHECK ("parentKey" = COALESCE("parentId", 'root') AND "id" <> 'root' AND ("parentId" IS NULL OR "parentId" <> "id"));
-- Recover known original names from completed upload sessions only.
UPDATE "MediaAsset" AS asset SET "originalFileName" = upload."fileName"
FROM "MediaUploadSession" AS upload
WHERE upload."assetId" = asset."id" AND upload."ownerEmail" = asset."ownerEmail"
  AND upload.status = 'completed' AND upload."operationId" IS NULL AND asset.origin = 'upload';
