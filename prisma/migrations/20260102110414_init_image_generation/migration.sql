-- CreateEnum
CREATE TYPE "ImageGenerationStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "ImageGeneration" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT,
    "aspectRatio" TEXT NOT NULL,
    "imageCount" INTEGER NOT NULL,
    "cfgScale" DOUBLE PRECISION NOT NULL,
    "steps" INTEGER NOT NULL,
    "seed" TEXT,
    "sampler" TEXT,
    "status" "ImageGenerationStatus" NOT NULL,
    "progress" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageGenerationImage" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageGenerationImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImageGeneration_requestId_key" ON "ImageGeneration"("requestId");

-- CreateIndex
CREATE INDEX "ImageGenerationImage_generationId_idx" ON "ImageGenerationImage"("generationId");

-- AddForeignKey
ALTER TABLE "ImageGenerationImage" ADD CONSTRAINT "ImageGenerationImage_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "ImageGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
