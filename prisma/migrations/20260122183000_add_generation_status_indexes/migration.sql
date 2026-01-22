-- CreateIndex
CREATE INDEX "ImageGeneration_status_createdAt_idx" ON "ImageGeneration"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ImageGeneration_status_updatedAt_idx" ON "ImageGeneration"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "VideoGeneration_status_createdAt_idx" ON "VideoGeneration"("status", "createdAt");

-- CreateIndex
CREATE INDEX "VideoGeneration_status_updatedAt_idx" ON "VideoGeneration"("status", "updatedAt");
