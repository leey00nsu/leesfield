-- CreateEnum
CREATE TYPE "QueueJobKind" AS ENUM ('generate_image', 'generate_video', 'generate_audio', 'media_operation', 'assistant', 'storage_cleanup');

-- CreateEnum
CREATE TYPE "QueueSourceType" AS ENUM ('image_generation', 'video_generation', 'audio_generation', 'media_operation', 'assistant_execution', 'storage_cleanup');

-- CreateEnum
CREATE TYPE "QueueJobStatus" AS ENUM ('suspended', 'ready', 'retry_wait', 'active', 'succeeded', 'dead_letter', 'reconciliation_required', 'cancelled', 'abandoned');

-- CreateEnum
CREATE TYPE "QueueRuntimeMode" AS ENUM ('paused', 'shared');

-- CreateEnum
CREATE TYPE "QueueAttemptPhase" AS ENUM ('claimed', 'remote_started', 'settling', 'ended');

-- CreateEnum
CREATE TYPE "QueueAttemptOutcome" AS ENUM ('succeeded', 'failed', 'cancelled', 'retrying', 'protected', 'reconciliation_required');

-- CreateEnum
CREATE TYPE "QueueReservationDisposition" AS ENUM ('held', 'uncertain');

-- CreateEnum
CREATE TYPE "QueueDeadLetterClassification" AS ENUM ('terminal', 'reconciliation');

-- CreateEnum
CREATE TYPE "QueueDeadLetterState" AS ENUM ('open', 'redriven', 'resolved', 'abandoned');

-- AlterTable
ALTER TABLE "MediaCleanupTask" ADD COLUMN     "queueRevision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "QueueRuntime" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "mode" "QueueRuntimeMode" NOT NULL DEFAULT 'paused',
    "epoch" INTEGER NOT NULL DEFAULT 1,
    "nextKindCursor" INTEGER NOT NULL DEFAULT 0,
    "migrationCursor" JSONB NOT NULL DEFAULT '{}',
    "migrationVerified" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueRuntime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueOrderGroup" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerScopeDigest" TEXT NOT NULL,
    "opaqueKey" TEXT NOT NULL,
    "nextSequence" BIGINT NOT NULL DEFAULT 1,
    "headSequence" BIGINT NOT NULL DEFAULT 1,
    "blockedByJobId" UUID,
    "closedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueOrderGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueJob" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "QueueJobKind" NOT NULL,
    "sourceType" "QueueSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceRevision" INTEGER NOT NULL DEFAULT 0,
    "snapshotRef" TEXT NOT NULL,
    "ownerScopeDigest" TEXT NOT NULL,
    "executionType" "QueueSourceType" NOT NULL,
    "executionId" TEXT NOT NULL,
    "orderGroupId" UUID,
    "sequence" BIGINT,
    "status" "QueueJobStatus" NOT NULL DEFAULT 'ready',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "retryDelayMs" INTEGER NOT NULL DEFAULT 0,
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 0,
    "cancelRequestedAt" TIMESTAMP(3),
    "currentAttemptId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueAttempt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "jobId" UUID NOT NULL,
    "lifetimeOrdinal" INTEGER NOT NULL,
    "cycle" INTEGER NOT NULL,
    "cycleOrdinal" INTEGER NOT NULL,
    "executionType" "QueueSourceType" NOT NULL,
    "executionId" TEXT NOT NULL,
    "workerInstanceId" UUID NOT NULL,
    "leaseToken" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leaseVersion" INTEGER NOT NULL,
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "runtimeEpoch" INTEGER NOT NULL,
    "phase" "QueueAttemptPhase" NOT NULL DEFAULT 'claimed',
    "outcome" "QueueAttemptOutcome",
    "remoteEvidenceRef" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "QueueAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueResource" (
    "key" TEXT NOT NULL,
    "staticCapacity" INTEGER,
    "modelType" "ModelCatalogType",
    "modelKey" TEXT,

    CONSTRAINT "QueueResource_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "QueueJobResource" (
    "jobId" UUID NOT NULL,
    "resourceKey" TEXT NOT NULL,

    CONSTRAINT "QueueJobResource_pkey" PRIMARY KEY ("jobId","resourceKey")
);

-- CreateTable
CREATE TABLE "QueueReservation" (
    "attemptId" UUID NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "disposition" "QueueReservationDisposition" NOT NULL DEFAULT 'held',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "QueueReservation_pkey" PRIMARY KEY ("attemptId","resourceKey")
);

-- CreateTable
CREATE TABLE "QueueDeadLetter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "jobId" UUID NOT NULL,
    "failedAttemptId" UUID NOT NULL,
    "classification" "QueueDeadLetterClassification" NOT NULL,
    "state" "QueueDeadLetterState" NOT NULL DEFAULT 'open',
    "safeErrorCode" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "detailPurgedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QueueDeadLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueAdminAction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requestId" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "actorDigest" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "jobId" UUID,
    "deadLetterId" UUID,
    "expectedVersion" INTEGER,
    "safeReason" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueAdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QueueOrderGroup_blockedByJobId_key" ON "QueueOrderGroup"("blockedByJobId");

-- CreateIndex
CREATE UNIQUE INDEX "QueueOrderGroup_ownerScopeDigest_opaqueKey_key" ON "QueueOrderGroup"("ownerScopeDigest", "opaqueKey");

-- CreateIndex
CREATE UNIQUE INDEX "QueueOrderGroup_id_ownerScopeDigest_key" ON "QueueOrderGroup"("id", "ownerScopeDigest");

-- CreateIndex
CREATE INDEX "QueueJob_kind_status_availableAt_createdAt_id_idx" ON "QueueJob"("kind", "status", "availableAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "QueueJob_ownerScopeDigest_createdAt_id_idx" ON "QueueJob"("ownerScopeDigest", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "QueueJob_source_identity" ON "QueueJob"("kind", "sourceType", "sourceId", "sourceRevision");

-- CreateIndex
CREATE UNIQUE INDEX "QueueJob_orderGroupId_sequence_key" ON "QueueJob"("orderGroupId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "QueueJob_id_currentAttemptId_key" ON "QueueJob"("id", "currentAttemptId");

-- CreateIndex
CREATE INDEX "QueueAttempt_finishedAt_leaseUntil_idx" ON "QueueAttempt"("finishedAt", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "QueueAttempt_jobId_lifetimeOrdinal_key" ON "QueueAttempt"("jobId", "lifetimeOrdinal");

-- CreateIndex
CREATE UNIQUE INDEX "QueueAttempt_jobId_cycle_cycleOrdinal_key" ON "QueueAttempt"("jobId", "cycle", "cycleOrdinal");

-- CreateIndex
CREATE UNIQUE INDEX "QueueAttempt_jobId_id_key" ON "QueueAttempt"("jobId", "id");

-- CreateIndex
CREATE INDEX "QueueJobResource_resourceKey_idx" ON "QueueJobResource"("resourceKey");

-- CreateIndex
CREATE INDEX "QueueReservation_resourceKey_releasedAt_idx" ON "QueueReservation"("resourceKey", "releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QueueDeadLetter_failedAttemptId_key" ON "QueueDeadLetter"("failedAttemptId");

-- CreateIndex
CREATE INDEX "QueueDeadLetter_state_classification_createdAt_id_idx" ON "QueueDeadLetter"("state", "classification", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "QueueDeadLetter_jobId_failedAttemptId_key" ON "QueueDeadLetter"("jobId", "failedAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "QueueAdminAction_requestId_key" ON "QueueAdminAction"("requestId");

-- CreateIndex
CREATE INDEX "QueueAdminAction_jobId_createdAt_id_idx" ON "QueueAdminAction"("jobId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "QueueOrderGroup" ADD CONSTRAINT "QueueOrderGroup_blockedByJobId_fkey" FOREIGN KEY ("blockedByJobId") REFERENCES "QueueJob"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "QueueJob" ADD CONSTRAINT "QueueJob_orderGroupId_ownerScopeDigest_fkey" FOREIGN KEY ("orderGroupId", "ownerScopeDigest") REFERENCES "QueueOrderGroup"("id", "ownerScopeDigest") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "QueueJob" ADD CONSTRAINT "QueueJob_id_currentAttemptId_fkey" FOREIGN KEY ("id", "currentAttemptId") REFERENCES "QueueAttempt"("jobId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "QueueAttempt" ADD CONSTRAINT "QueueAttempt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "QueueJob"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "QueueJobResource" ADD CONSTRAINT "QueueJobResource_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "QueueJob"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "QueueJobResource" ADD CONSTRAINT "QueueJobResource_resourceKey_fkey" FOREIGN KEY ("resourceKey") REFERENCES "QueueResource"("key") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "QueueReservation" ADD CONSTRAINT "QueueReservation_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QueueAttempt"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "QueueReservation" ADD CONSTRAINT "QueueReservation_resourceKey_fkey" FOREIGN KEY ("resourceKey") REFERENCES "QueueResource"("key") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "QueueDeadLetter" ADD CONSTRAINT "QueueDeadLetter_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "QueueJob"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "QueueDeadLetter" ADD CONSTRAINT "QueueDeadLetter_jobId_failedAttemptId_fkey" FOREIGN KEY ("jobId", "failedAttemptId") REFERENCES "QueueAttempt"("jobId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "QueueAdminAction" ADD CONSTRAINT "QueueAdminAction_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "QueueJob"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "QueueAdminAction" ADD CONSTRAINT "QueueAdminAction_deadLetterId_fkey" FOREIGN KEY ("deadLetterId") REFERENCES "QueueDeadLetter"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
-- The queue is intentionally opt-in. This migration never starts a worker.
INSERT INTO "QueueRuntime" ("id") VALUES (1);
ALTER TABLE "MediaCleanupTask" ADD CONSTRAINT "MediaCleanupTask_queueRevision_check" CHECK ("queueRevision" >= 0);
ALTER TABLE "QueueRuntime" ADD CONSTRAINT "QueueRuntime_bounds" CHECK (
  "id" = 1 AND "epoch" > 0 AND "nextKindCursor" BETWEEN 0 AND 5
  AND ("mode" <> 'shared' OR "migrationVerified")
);
ALTER TABLE "QueueOrderGroup" ADD CONSTRAINT "QueueOrderGroup_bounds" CHECK (
  "headSequence" > 0 AND "nextSequence" >= "headSequence" AND "version" >= 0
);
ALTER TABLE "QueueJob" ADD CONSTRAINT "QueueJob_policy_bounds" CHECK (
  "sourceRevision" >= 0 AND "maxAttempts" BETWEEN 1 AND 100
  AND "retryDelayMs" BETWEEN 0 AND 3600000
  AND "policyVersion" > 0 AND "cycle" > 0 AND "version" >= 0
);
ALTER TABLE "QueueJob" ADD CONSTRAINT "QueueJob_order_pair" CHECK (
  ("orderGroupId" IS NULL AND "sequence" IS NULL)
  OR ("orderGroupId" IS NOT NULL AND "sequence" IS NOT NULL AND "sequence" > 0)
);
ALTER TABLE "QueueJob" ADD CONSTRAINT "QueueJob_source_kind" CHECK (
  ("kind" = 'generate_image' AND "sourceType" = 'image_generation')
  OR ("kind" = 'generate_video' AND "sourceType" = 'video_generation')
  OR ("kind" = 'generate_audio' AND "sourceType" = 'audio_generation')
  OR ("kind" = 'media_operation' AND "sourceType" = 'media_operation')
  OR ("kind" = 'assistant' AND "sourceType" = 'assistant_execution')
  OR ("kind" = 'storage_cleanup' AND "sourceType" = 'storage_cleanup')
);
ALTER TABLE "QueueJob" ADD CONSTRAINT "QueueJob_execution_type" CHECK ("executionType" = "sourceType");
ALTER TABLE "QueueJob" ADD CONSTRAINT "QueueJob_identity_nonempty" CHECK (
  length("sourceId") BETWEEN 1 AND 200 AND length("snapshotRef") BETWEEN 1 AND 400
  AND length("executionId") BETWEEN 1 AND 200 AND "ownerScopeDigest" ~ '^[a-f0-9]{64}$'
);
ALTER TABLE "QueueOrderGroup" ADD CONSTRAINT "QueueOrderGroup_scope" CHECK (
  "ownerScopeDigest" ~ '^[a-f0-9]{64}$' AND length("opaqueKey") BETWEEN 1 AND 200
);
ALTER TABLE "QueueAttempt" ADD CONSTRAINT "QueueAttempt_bounds" CHECK (
  "lifetimeOrdinal" > 0 AND "cycle" > 0 AND "cycleOrdinal" > 0
  AND "leaseVersion" > 0 AND "runtimeEpoch" > 0 AND "leaseUntil" > "startedAt"
);
ALTER TABLE "QueueAttempt" ADD CONSTRAINT "QueueAttempt_terminal_pair" CHECK (
  ("finishedAt" IS NULL AND "outcome" IS NULL AND "phase" <> 'ended')
  OR ("finishedAt" IS NOT NULL AND "finishedAt" >= "startedAt" AND "outcome" IS NOT NULL AND "phase" = 'ended')
);
ALTER TABLE "QueueResource" ADD CONSTRAINT "QueueResource_policy" CHECK (
  length("key") BETWEEN 1 AND 200 AND (
    ("staticCapacity" IS NOT NULL AND "staticCapacity" BETWEEN 0 AND 1000 AND "modelType" IS NULL AND "modelKey" IS NULL)
    OR ("staticCapacity" IS NULL AND "modelType" IS NOT NULL AND "modelKey" IS NOT NULL AND length("modelKey") BETWEEN 1 AND 200)
  )
);
ALTER TABLE "QueueReservation" ADD CONSTRAINT "QueueReservation_release_time" CHECK (
  "releasedAt" IS NULL OR "releasedAt" >= "createdAt"
);
ALTER TABLE "QueueDeadLetter" ADD CONSTRAINT "QueueDeadLetter_resolution" CHECK (
  ("state" IN ('open','redriven') AND "resolvedAt" IS NULL)
  OR ("state" IN ('resolved','abandoned') AND "resolvedAt" IS NOT NULL)
);
ALTER TABLE "QueueDeadLetter" ADD CONSTRAINT "QueueDeadLetter_safe_error" CHECK (
  "safeErrorCode" ~ '^[A-Z][A-Z0-9_]{0,119}$' AND length("phase") BETWEEN 1 AND 80
  AND "version" >= 0 AND ("detailPurgedAt" IS NULL OR "state" IN ('resolved','abandoned'))
);
ALTER TABLE "QueueAdminAction" ADD CONSTRAINT "QueueAdminAction_bounds" CHECK (
  length("requestId") BETWEEN 1 AND 128 AND "requestFingerprint" ~ '^[a-f0-9]{64}$'
  AND "actorDigest" ~ '^[a-f0-9]{64}$' AND ("expectedVersion" IS NULL OR "expectedVersion" >= 0)
  AND length("safeReason") BETWEEN 1 AND 500
  AND "action" IN ('redrive','reconcile','abandon','cancel_group')
  AND "outcome" IN ('accepted','rejected','succeeded','failed')
);
CREATE UNIQUE INDEX "QueueAttempt_one_running_per_job" ON "QueueAttempt" ("jobId") WHERE "finishedAt" IS NULL;
CREATE UNIQUE INDEX "QueueDeadLetter_one_open_per_job" ON "QueueDeadLetter" ("jobId") WHERE "state" = 'open';
CREATE INDEX "QueueJob_ready_dispatch" ON "QueueJob" ("kind", "availableAt", "createdAt", "id") WHERE "status" IN ('ready','retry_wait');
CREATE INDEX "QueueReservation_held_resource" ON "QueueReservation" ("resourceKey", "attemptId") WHERE "releasedAt" IS NULL;

-- Identity, ownership and ordering survive redrive and retention.
CREATE FUNCTION leesfield_queue_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."kind", NEW."sourceType", NEW."sourceId", NEW."sourceRevision",
         NEW."snapshotRef", NEW."ownerScopeDigest", NEW."orderGroupId", NEW."sequence")
     IS DISTINCT FROM
     ROW(OLD."kind", OLD."sourceType", OLD."sourceId", OLD."sourceRevision",
         OLD."snapshotRef", OLD."ownerScopeDigest", OLD."orderGroupId", OLD."sequence") THEN
    RAISE EXCEPTION 'QUEUE_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "QueueJob_identity_immutable" BEFORE UPDATE ON "QueueJob"
  FOR EACH ROW EXECUTE FUNCTION leesfield_queue_identity_immutable();

-- Deferrable validation allows claim/settle to update both rows in one
-- transaction while rejecting a foreign, ended or orphan running attempt.
CREATE FUNCTION leesfield_queue_check_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  job_id uuid;
  job_row "QueueJob"%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'QueueJob' THEN job_id := NEW."id";
  ELSE job_id := NEW."jobId"; END IF;
  SELECT * INTO job_row FROM "QueueJob" WHERE "id" = job_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF job_row."status" = 'active' AND NOT EXISTS (
    SELECT 1 FROM "QueueAttempt" a WHERE a."id" = job_row."currentAttemptId"
      AND a."jobId" = job_id AND a."finishedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'QUEUE_ACTIVE_ATTEMPT_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "QueueAttempt" a WHERE a."jobId" = job_id AND a."finishedAt" IS NULL
      AND (job_row."status" <> 'active' OR job_row."currentAttemptId" IS DISTINCT FROM a."id")
  ) THEN
    RAISE EXCEPTION 'QUEUE_ORPHAN_RUNNING_ATTEMPT' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "QueueJob_current_attempt_state" AFTER INSERT OR UPDATE ON "QueueJob"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION leesfield_queue_check_attempt();
CREATE CONSTRAINT TRIGGER "QueueAttempt_current_job_state" AFTER INSERT OR UPDATE ON "QueueAttempt"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION leesfield_queue_check_attempt();

CREATE FUNCTION leesfield_queue_check_blocker() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."blockedByJobId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "QueueJob" WHERE "id" = NEW."blockedByJobId" AND "orderGroupId" = NEW."id"
      AND "ownerScopeDigest" = NEW."ownerScopeDigest"
  ) THEN
    RAISE EXCEPTION 'QUEUE_GROUP_BLOCKER_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "QueueOrderGroup_blocker_membership" AFTER INSERT OR UPDATE ON "QueueOrderGroup"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION leesfield_queue_check_blocker();
