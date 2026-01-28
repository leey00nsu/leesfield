-- AlterTable
ALTER TABLE "ImageGeneration" ADD COLUMN "apiKeyId" TEXT;

-- AlterTable
ALTER TABLE "VideoGeneration" ADD COLUMN "apiKeyId" TEXT;

-- AddForeignKey
ALTER TABLE "ImageGeneration"
ADD CONSTRAINT "ImageGeneration_apiKeyId_fkey"
FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoGeneration"
ADD CONSTRAINT "VideoGeneration_apiKeyId_fkey"
FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ImageGeneration_apiKeyId_createdAt_idx" ON "ImageGeneration"("apiKeyId", "createdAt");

-- CreateIndex
CREATE INDEX "VideoGeneration_apiKeyId_createdAt_idx" ON "VideoGeneration"("apiKeyId", "createdAt");
