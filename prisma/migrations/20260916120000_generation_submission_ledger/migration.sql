-- Durable admission/idempotency ledger for generation submissions.
CREATE TABLE "GenerationSubmission" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "scope" TEXT NOT NULL,
    "idempotencyHash" TEXT,
    "payloadHash" TEXT NOT NULL,
    "providerKey" TEXT,
    "graphNodeId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'preparing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GenerationSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GenerationSubmission_requestId_key" ON "GenerationSubmission"("requestId");
CREATE UNIQUE INDEX "GenerationSubmission_scope_idempotencyHash_key" ON "GenerationSubmission"("scope", "idempotencyHash");
CREATE INDEX "GenerationSubmission_ownerEmail_state_idx" ON "GenerationSubmission"("ownerEmail", "state");
CREATE INDEX "GenerationSubmission_providerKey_state_idx" ON "GenerationSubmission"("providerKey", "state");
CREATE INDEX "GenerationSubmission_state_expiresAt_idx" ON "GenerationSubmission"("state", "expiresAt");
