-- Preserve existing Spaces. v2 Split metadata is converted on read and saved
-- atomically by the v3 writer; this migration never deletes graph/media rows.
ALTER TABLE "GenerationGraph" ADD COLUMN "groups" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "GenerationGraph" ALTER COLUMN "schemaVersion" SET DEFAULT 3;
ALTER TABLE "GenerationGraph" ALTER COLUMN "minimumWriterVersion" SET DEFAULT 3;

-- A stale deployment must not erase groups by writing a v2 document over v3.
CREATE FUNCTION prevent_space_writer_downgrade() RETURNS trigger AS $$
BEGIN
  IF NEW."schemaVersion" < OLD."schemaVersion"
     OR NEW."minimumWriterVersion" < OLD."minimumWriterVersion" THEN
    RAISE EXCEPTION 'SPACE_WRITER_DOWNGRADE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER prevent_space_writer_downgrade
BEFORE UPDATE ON "GenerationGraph"
FOR EACH ROW EXECUTE FUNCTION prevent_space_writer_downgrade();
