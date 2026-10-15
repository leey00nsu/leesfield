-- Existing terminal rows deliberately remain unknown; updatedAt is not a finish time.
ALTER TABLE "ImageGeneration" ADD COLUMN "finishedAt" TIMESTAMP(3);
ALTER TABLE "VideoGeneration" ADD COLUMN "finishedAt" TIMESTAMP(3);
ALTER TABLE "AudioGeneration" ADD COLUMN "finishedAt" TIMESTAMP(3);

-- Stamp only a real terminal transition, preserving the original value on later edits.
CREATE FUNCTION leesfield_execution_finished_at() RETURNS trigger AS $$
BEGIN
  IF NEW.status::text IN ('completed', 'failed', 'cancelled') THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.status::text IN ('completed', 'failed', 'cancelled') THEN
        NEW."finishedAt" := OLD."finishedAt";
        RETURN NEW;
      END IF;
    END IF;
    NEW."finishedAt" := clock_timestamp();
  ELSE
    NEW."finishedAt" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER image_execution_finished_at BEFORE INSERT OR UPDATE ON "ImageGeneration"
FOR EACH ROW EXECUTE FUNCTION leesfield_execution_finished_at();
CREATE TRIGGER video_execution_finished_at BEFORE INSERT OR UPDATE ON "VideoGeneration"
FOR EACH ROW EXECUTE FUNCTION leesfield_execution_finished_at();
CREATE TRIGGER audio_execution_finished_at BEFORE INSERT OR UPDATE ON "AudioGeneration"
FOR EACH ROW EXECUTE FUNCTION leesfield_execution_finished_at();

-- Operations and assistants already have completedAt; cover failure/cancellation/recovery too.
CREATE FUNCTION leesfield_execution_completed_at() RETURNS trigger AS $$
BEGIN
  IF NEW.status::text IN ('completed', 'failed', 'cancelled') THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.status::text IN ('completed', 'failed', 'cancelled') THEN
        NEW."completedAt" := OLD."completedAt";
        RETURN NEW;
      END IF;
    END IF;
    NEW."completedAt" := clock_timestamp();
  ELSE
    NEW."completedAt" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER operation_execution_completed_at BEFORE INSERT OR UPDATE ON "MediaOperation"
FOR EACH ROW EXECUTE FUNCTION leesfield_execution_completed_at();
CREATE TRIGGER assistant_execution_completed_at BEFORE INSERT OR UPDATE ON "AssistantExecution"
FOR EACH ROW EXECUTE FUNCTION leesfield_execution_completed_at();
