CREATE UNIQUE INDEX "AssistantExecution_id_ownerEmail_key" ON "AssistantExecution"("id", "ownerEmail");
CREATE TABLE "AssistantExecutionInputAsset" (
  "executionId" TEXT NOT NULL,
  "ownerEmail" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "portId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "AssistantExecutionInputAsset_pkey" PRIMARY KEY ("executionId", "portId", "sortOrder"),
  CONSTRAINT "AssistantExecutionInputAsset_executionId_ownerEmail_fkey" FOREIGN KEY ("executionId", "ownerEmail") REFERENCES "AssistantExecution"("id", "ownerEmail") ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT "AssistantExecutionInputAsset_assetId_ownerEmail_fkey" FOREIGN KEY ("assetId", "ownerEmail") REFERENCES "MediaAsset"("id", "ownerEmail") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "AssistantExecutionInputAsset_ownerEmail_assetId_idx" ON "AssistantExecutionInputAsset"("ownerEmail", "assetId");

-- Recover only durable, same-owner references already present in immutable snapshots.
INSERT INTO "AssistantExecutionInputAsset" ("executionId", "ownerEmail", "assetId", "portId", "sortOrder")
SELECT DISTINCT ON (e."id", item->>'portId', ord)
  e."id", e."ownerEmail", a."id", item->>'portId', ord
FROM "AssistantExecution" e
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(e."inputSnapshot"->'assets') = 'array' THEN e."inputSnapshot"->'assets' ELSE '[]'::jsonb END
) WITH ORDINALITY AS entries(item, position)
CROSS JOIN LATERAL (SELECT CASE WHEN item->>'sortOrder' ~ '^[0-9]{1,9}$' THEN (item->>'sortOrder')::integer ELSE 0 END AS ord) ordering
JOIN "MediaAsset" a ON a."id" = item->>'assetId' AND a."ownerEmail" = e."ownerEmail"
WHERE a."type" IN ('image', 'video') AND a."status" = 'completed'
  AND jsonb_typeof(item->'portId') = 'string' AND length(item->>'portId') > 0
ORDER BY e."id", item->>'portId', ord, position;
