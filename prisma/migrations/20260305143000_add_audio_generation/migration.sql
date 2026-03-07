-- CreateEnum
CREATE TYPE "AudioGenerationStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- AlterEnum
ALTER TYPE "ModelCatalogType" ADD VALUE 'audio';

-- CreateTable
CREATE TABLE "AudioGeneration" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "ownerEmail" TEXT,
    "apiKeyId" TEXT,
    "prompt" TEXT NOT NULL,
    "requestParams" JSONB,
    "modelKey" TEXT,
    "status" "AudioGenerationStatus" NOT NULL,
    "progress" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioGenerationAudio" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "durationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioGenerationAudio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AudioGeneration_requestId_key" ON "AudioGeneration"("requestId");

-- CreateIndex
CREATE INDEX "AudioGeneration_ownerEmail_idx" ON "AudioGeneration"("ownerEmail");

-- CreateIndex
CREATE INDEX "AudioGeneration_status_createdAt_idx" ON "AudioGeneration"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AudioGeneration_status_updatedAt_idx" ON "AudioGeneration"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "AudioGeneration_status_modelKey_idx" ON "AudioGeneration"("status", "modelKey");

-- CreateIndex
CREATE INDEX "AudioGeneration_apiKeyId_createdAt_idx" ON "AudioGeneration"("apiKeyId", "createdAt");

-- CreateIndex
CREATE INDEX "AudioGenerationAudio_generationId_idx" ON "AudioGenerationAudio"("generationId");

-- AddForeignKey
ALTER TABLE "AudioGeneration"
ADD CONSTRAINT "AudioGeneration_apiKeyId_fkey"
FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioGenerationAudio"
ADD CONSTRAINT "AudioGenerationAudio_generationId_fkey"
FOREIGN KEY ("generationId") REFERENCES "AudioGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
