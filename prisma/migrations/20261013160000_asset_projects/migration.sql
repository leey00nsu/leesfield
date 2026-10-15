CREATE TABLE "AssetProject" (
  "id" TEXT NOT NULL,
  "ownerEmail" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1,
  "parentId" TEXT,
  "parentKey" TEXT NOT NULL DEFAULT 'root',
  "coverAssetId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetProject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssetProject_id_ownerEmail_key" ON "AssetProject"("id", "ownerEmail");
CREATE UNIQUE INDEX "AssetProject_ownerEmail_parentKey_normalizedName_key" ON "AssetProject"("ownerEmail", "parentKey", "normalizedName");
CREATE INDEX "AssetProject_ownerEmail_parentId_idx" ON "AssetProject"("ownerEmail", "parentId");
CREATE INDEX "AssetProject_ownerEmail_coverAssetId_idx" ON "AssetProject"("ownerEmail", "coverAssetId");
ALTER TABLE "AssetProject" ADD CONSTRAINT "AssetProject_parentId_ownerEmail_fkey" FOREIGN KEY ("parentId", "ownerEmail") REFERENCES "AssetProject"("id", "ownerEmail") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AssetProject" ADD CONSTRAINT "AssetProject_coverAssetId_ownerEmail_fkey" FOREIGN KEY ("coverAssetId", "ownerEmail") REFERENCES "MediaAsset"("id", "ownerEmail") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE TABLE "AssetProjectMembership" (
  "assetId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "ownerEmail" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetProjectMembership_pkey" PRIMARY KEY ("assetId", "projectId")
);
CREATE INDEX "AssetProjectMembership_ownerEmail_projectId_assetId_idx" ON "AssetProjectMembership"("ownerEmail", "projectId", "assetId");
ALTER TABLE "AssetProjectMembership" ADD CONSTRAINT "AssetProjectMembership_assetId_ownerEmail_fkey" FOREIGN KEY ("assetId", "ownerEmail") REFERENCES "MediaAsset"("id", "ownerEmail") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "AssetProjectMembership" ADD CONSTRAINT "AssetProjectMembership_projectId_ownerEmail_fkey" FOREIGN KEY ("projectId", "ownerEmail") REFERENCES "AssetProject"("id", "ownerEmail") ON DELETE CASCADE ON UPDATE RESTRICT;
INSERT INTO "AssetProject" ("id", "ownerEmail", "name", "normalizedName", "version", "parentId", "parentKey", "createdAt", "updatedAt")
SELECT "id", "ownerEmail", "name", "normalizedName", "version", "parentId", "parentKey", "createdAt", "updatedAt" FROM "AssetFolder";
INSERT INTO "AssetProjectMembership" ("assetId", "projectId", "ownerEmail")
SELECT "id", "folderId", "ownerEmail" FROM "MediaAsset" WHERE "folderId" IS NOT NULL;
