CREATE OR REPLACE FUNCTION "notify_node_generation_updated"()
RETURNS TRIGGER AS $$
DECLARE
  graph_id TEXT;
  event_payload JSON;
BEGIN
  IF NEW."graphNodeId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW."status" IS NOT DISTINCT FROM OLD."status"
    AND NEW."progress" IS NOT DISTINCT FROM OLD."progress"
    AND NEW."graphNodeId" IS NOT DISTINCT FROM OLD."graphNodeId"
  THEN
    RETURN NEW;
  END IF;

  SELECT "graphId"
  INTO graph_id
  FROM "GenerationGraphNode"
  WHERE "id" = NEW."graphNodeId";

  IF graph_id IS NULL THEN
    RETURN NEW;
  END IF;

  event_payload := json_build_object(
    'version', 1,
    'type', 'generation.updated',
    'graphId', graph_id,
    'graphNodeId', NEW."graphNodeId",
    'requestId', NEW."requestId",
    'status', NEW."status",
    'progress', NEW."progress",
    'updatedAt', to_char(
      NEW."updatedAt" AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
  );

  PERFORM pg_notify('leesfield_generation_events_v1', event_payload::TEXT);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ImageGeneration_notify_node_generation_updated"
AFTER INSERT OR UPDATE OF "status", "progress", "graphNodeId"
ON "ImageGeneration"
FOR EACH ROW
EXECUTE FUNCTION "notify_node_generation_updated"();
