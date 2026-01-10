-- CreateEnum
CREATE TYPE "VideoGenerationStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "VideoGeneration" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "requestParams" JSONB,
    "status" "VideoGenerationStatus" NOT NULL,
    "progress" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoGenerationVideo" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoGenerationVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoGeneration_requestId_key" ON "VideoGeneration"("requestId");

-- CreateIndex
CREATE INDEX "VideoGenerationVideo_generationId_idx" ON "VideoGenerationVideo"("generationId");

-- AddForeignKey
ALTER TABLE "VideoGenerationVideo" ADD CONSTRAINT "VideoGenerationVideo_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "VideoGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
