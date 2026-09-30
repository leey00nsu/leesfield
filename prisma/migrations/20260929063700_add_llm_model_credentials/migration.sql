ALTER TYPE "ModelCatalogType" ADD VALUE 'llm';

CREATE TABLE "ModelCredential" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModelCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModelCredential_modelId_key" ON "ModelCredential"("modelId");
ALTER TABLE "ModelCredential" ADD CONSTRAINT "ModelCredential_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ModelCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
