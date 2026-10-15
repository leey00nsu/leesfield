-- Rename in place: preserve all historical timestamps and NULL values.
BEGIN;
DROP TRIGGER operation_execution_completed_at ON "MediaOperation";
DROP TRIGGER assistant_execution_completed_at ON "AssistantExecution";
DROP FUNCTION leesfield_execution_completed_at();

ALTER TABLE "MediaOperation" RENAME COLUMN "completedAt" TO "finishedAt";
ALTER TABLE "AssistantExecution" RENAME COLUMN "completedAt" TO "finishedAt";

-- All five execution tables now share the same terminal timestamp policy.
CREATE TRIGGER operation_execution_finished_at BEFORE INSERT OR UPDATE ON "MediaOperation"
FOR EACH ROW EXECUTE FUNCTION leesfield_execution_finished_at();
CREATE TRIGGER assistant_execution_finished_at BEFORE INSERT OR UPDATE ON "AssistantExecution"
FOR EACH ROW EXECUTE FUNCTION leesfield_execution_finished_at();
COMMIT;
