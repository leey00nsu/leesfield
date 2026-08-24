-- CreateEnum
CREATE TYPE "GenerationGraphNodeType" AS ENUM ('imageGeneration');

-- CreateEnum
CREATE TYPE "GenerationGraphEdgeKind" AS ENUM ('primary', 'reference');

-- CreateTable
CREATE TABLE "GenerationGraph" (
    "id" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationGraph_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationGraphNode" (
    "id" TEXT NOT NULL,
    "graphId" TEXT NOT NULL,
    "type" "GenerationGraphNodeType" NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "configVersion" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "selectedOutputImageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationGraphNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationGraphEdge" (
    "id" TEXT NOT NULL,
    "graphId" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "kind" "GenerationGraphEdgeKind" NOT NULL,
    "sourceHandle" TEXT,
    "targetHandle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationGraphEdge_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ImageGeneration" ADD COLUMN "graphNodeId" TEXT;

-- CreateIndex
CREATE INDEX "GenerationGraph_ownerEmail_updatedAt_idx" ON "GenerationGraph"("ownerEmail", "updatedAt");

-- CreateIndex
CREATE INDEX "GenerationGraphNode_graphId_idx" ON "GenerationGraphNode"("graphId");

-- CreateIndex
CREATE INDEX "GenerationGraphNode_selectedOutputImageId_idx" ON "GenerationGraphNode"("selectedOutputImageId");

-- CreateIndex
CREATE INDEX "GenerationGraphEdge_graphId_idx" ON "GenerationGraphEdge"("graphId");

-- CreateIndex
CREATE INDEX "GenerationGraphEdge_sourceNodeId_idx" ON "GenerationGraphEdge"("sourceNodeId");

-- CreateIndex
CREATE INDEX "GenerationGraphEdge_targetNodeId_idx" ON "GenerationGraphEdge"("targetNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationGraphEdge_graphId_sourceNodeId_targetNodeId_kind_sourceHandle_targetHandle_key" ON "GenerationGraphEdge"("graphId", "sourceNodeId", "targetNodeId", "kind", "sourceHandle", "targetHandle");

-- CreateIndex
CREATE INDEX "ImageGeneration_graphNodeId_createdAt_idx" ON "ImageGeneration"("graphNodeId", "createdAt");

-- AddForeignKey
ALTER TABLE "GenerationGraphNode" ADD CONSTRAINT "GenerationGraphNode_graphId_fkey" FOREIGN KEY ("graphId") REFERENCES "GenerationGraph"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationGraphNode" ADD CONSTRAINT "GenerationGraphNode_selectedOutputImageId_fkey" FOREIGN KEY ("selectedOutputImageId") REFERENCES "ImageGenerationImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationGraphEdge" ADD CONSTRAINT "GenerationGraphEdge_graphId_fkey" FOREIGN KEY ("graphId") REFERENCES "GenerationGraph"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationGraphEdge" ADD CONSTRAINT "GenerationGraphEdge_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "GenerationGraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationGraphEdge" ADD CONSTRAINT "GenerationGraphEdge_targetNodeId_fkey" FOREIGN KEY ("targetNodeId") REFERENCES "GenerationGraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGeneration" ADD CONSTRAINT "ImageGeneration_graphNodeId_fkey" FOREIGN KEY ("graphNodeId") REFERENCES "GenerationGraphNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
