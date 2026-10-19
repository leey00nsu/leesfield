CREATE TABLE "NodeExecutionSubmission" (
  "id" TEXT NOT NULL,
  "ownerEmail" TEXT NOT NULL,
  "apiKeyId" TEXT NOT NULL,
  "graphId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "idempotencyHash" TEXT,
  "requestHash" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "nodeKind" TEXT NOT NULL,
  "inputSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NodeExecutionSubmission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NodeExecutionSubmission_graphId_fkey" FOREIGN KEY ("graphId") REFERENCES "GenerationGraph"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NodeExecutionSubmission_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "GenerationGraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NodeExecutionSubmission_executionId_key" ON "NodeExecutionSubmission"("executionId");
CREATE UNIQUE INDEX "NodeExecutionSubmission_scope_key" ON "NodeExecutionSubmission"("ownerEmail", "apiKeyId", "graphId", "nodeId", "idempotencyHash");
CREATE INDEX "NodeExecutionSubmission_graphId_nodeId_idx" ON "NodeExecutionSubmission"("graphId", "nodeId");
CREATE INDEX "NodeExecutionSubmission_nodeId_idx" ON "NodeExecutionSubmission"("nodeId");
