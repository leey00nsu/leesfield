-- CreateEnum
CREATE TYPE "ModelCatalogType" AS ENUM ('image', 'video');

-- CreateTable
CREATE TABLE "ModelCatalog" (
    "id" TEXT NOT NULL,
    "type" "ModelCatalogType" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerConfig" JSONB NOT NULL,
    "parameters" JSONB NOT NULL,
    "meta" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelCatalog_key_key" ON "ModelCatalog"("key");

-- CreateIndex
CREATE INDEX "ModelCatalog_type_isActive_idx" ON "ModelCatalog"("type", "isActive");

-- CreateIndex
CREATE INDEX "ModelCatalog_type_isDefault_idx" ON "ModelCatalog"("type", "isDefault");
