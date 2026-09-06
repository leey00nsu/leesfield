CREATE TABLE "SpaceEditorPreference" (
  "ownerEmail" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "recentModelKeys" JSONB NOT NULL DEFAULT '[]',
  "defaults" JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SpaceEditorPreference_pkey" PRIMARY KEY ("ownerEmail")
);
