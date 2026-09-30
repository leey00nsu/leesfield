CREATE TYPE "AssistantExecutionStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

CREATE TABLE "AssistantExecution" (
    "id" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "graphId" TEXT NOT NULL,
    "graphNodeId" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "status" "AssistantExecutionStatus" NOT NULL DEFAULT 'pending',
    "outputText" TEXT,
    "errorCode" TEXT,
    "executionLeaseToken" TEXT,
    "executionLeaseUntil" TIMESTAMP(3),
    "executionLeaseVersion" INTEGER NOT NULL DEFAULT 0,
    "cancelRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "AssistantExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssistantExecution_ownerEmail_graphNodeId_createdAt_idx" ON "AssistantExecution"("ownerEmail", "graphNodeId", "createdAt");
CREATE INDEX "AssistantExecution_status_executionLeaseUntil_idx" ON "AssistantExecution"("status", "executionLeaseUntil");
CREATE INDEX "AssistantExecution_graphId_graphNodeId_createdAt_idx" ON "AssistantExecution"("graphId", "graphNodeId", "createdAt");
ALTER TABLE "AssistantExecution" ADD CONSTRAINT "AssistantExecution_graphNodeId_fkey" FOREIGN KEY ("graphNodeId") REFERENCES "GenerationGraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
