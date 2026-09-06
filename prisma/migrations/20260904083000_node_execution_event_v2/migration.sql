CREATE OR REPLACE FUNCTION "notify_generation_node_execution_updated_v2"()
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
    'version', 2,
    'type', 'node-execution.updated',
    'executionKind', 'generation',
    'mediaType', TG_ARGV[0],
    'graphId', graph_id,
    'graphNodeId', NEW."graphNodeId",
    'executionId', NEW."requestId",
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

CREATE OR REPLACE FUNCTION "notify_media_operation_node_execution_updated_v2"()
RETURNS TRIGGER AS $$
DECLARE
  graph_id TEXT;
  media_type TEXT;
  event_payload JSON;
BEGIN
  IF NEW."graphId" IS NULL OR NEW."graphNodeId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW."status" IS NOT DISTINCT FROM OLD."status"
    AND NEW."progress" IS NOT DISTINCT FROM OLD."progress"
    AND NEW."graphId" IS NOT DISTINCT FROM OLD."graphId"
    AND NEW."graphNodeId" IS NOT DISTINCT FROM OLD."graphNodeId"
    AND NEW."type" IS NOT DISTINCT FROM OLD."type"
  THEN
    RETURN NEW;
  END IF;

  SELECT "graphId"
  INTO graph_id
  FROM "GenerationGraphNode"
  WHERE "id" = NEW."graphNodeId";

  IF graph_id IS NULL OR NEW."graphId" IS DISTINCT FROM graph_id THEN
    RETURN NEW;
  END IF;

  media_type := CASE
    WHEN NEW."type" = 'edit.video.frameGrab' THEN 'image'
    WHEN NEW."type" LIKE 'edit.image.%' THEN 'image'
    WHEN NEW."type" LIKE 'edit.audio.%' THEN 'audio'
    WHEN NEW."type" LIKE 'edit.video.%' THEN 'video'
    ELSE NULL
  END;

  IF media_type IS NULL THEN
    RETURN NEW;
  END IF;

  event_payload := json_build_object(
    'version', 2,
    'type', 'node-execution.updated',
    'executionKind', 'media_operation',
    'mediaType', media_type,
    'graphId', graph_id,
    'graphNodeId', NEW."graphNodeId",
    'executionId', NEW."id",
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

CREATE TRIGGER "ImageGeneration_notify_node_execution_updated_v2"
AFTER INSERT OR UPDATE OF "status", "progress", "graphNodeId"
ON "ImageGeneration"
FOR EACH ROW
EXECUTE FUNCTION "notify_generation_node_execution_updated_v2"('image');

CREATE TRIGGER "VideoGeneration_notify_node_execution_updated_v2"
AFTER INSERT OR UPDATE OF "status", "progress", "graphNodeId"
ON "VideoGeneration"
FOR EACH ROW
EXECUTE FUNCTION "notify_generation_node_execution_updated_v2"('video');

CREATE TRIGGER "AudioGeneration_notify_node_execution_updated_v2"
AFTER INSERT OR UPDATE OF "status", "progress", "graphNodeId"
ON "AudioGeneration"
FOR EACH ROW
EXECUTE FUNCTION "notify_generation_node_execution_updated_v2"('audio');

CREATE TRIGGER "MediaOperation_notify_node_execution_updated_v2"
AFTER INSERT OR UPDATE OF "status", "progress", "graphId", "graphNodeId", "type"
ON "MediaOperation"
FOR EACH ROW
EXECUTE FUNCTION "notify_media_operation_node_execution_updated_v2"();
