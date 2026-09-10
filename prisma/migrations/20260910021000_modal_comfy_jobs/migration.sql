CREATE TABLE "ModalComfyJob" (
    "requestId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "jobId" TEXT,
    "submission" JSONB,
    "lease" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModalComfyJob_pkey" PRIMARY KEY ("requestId")
);
