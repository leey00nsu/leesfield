-- AlterTable
ALTER TABLE "AssistantExecution" ADD COLUMN     "outputListJson" JSONB,
ADD COLUMN     "selectedItemId" TEXT,
ADD COLUMN     "selectionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PromptPreset" (
    "id" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "builtinKey" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "modality" "MediaType" NOT NULL,
    "prompt" TEXT,
    "requiredInputs" JSONB NOT NULL DEFAULT '{}',
    "recommendedParameters" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaOperationOutput" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "portId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "assetId" TEXT,

    CONSTRAINT "MediaOperationOutput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromptPreset_ownerEmail_modality_isActive_idx" ON "PromptPreset"("ownerEmail", "modality", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PromptPreset_ownerEmail_key_key" ON "PromptPreset"("ownerEmail", "key");

-- CreateIndex
CREATE INDEX "MediaOperationOutput_assetId_idx" ON "MediaOperationOutput"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaOperationOutput_operationId_portId_sortOrder_key" ON "MediaOperationOutput"("operationId", "portId", "sortOrder");

-- AddForeignKey
ALTER TABLE "MediaOperationOutput" ADD CONSTRAINT "MediaOperationOutput_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "MediaOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaOperationOutput" ADD CONSTRAINT "MediaOperationOutput_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
