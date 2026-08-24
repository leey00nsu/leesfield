-- Prevent concurrent active submissions for the same Graph Node while
-- preserving terminal Generation history and all Classic generations.
CREATE UNIQUE INDEX "ImageGeneration_one_active_per_graph_node"
ON "ImageGeneration"("graphNodeId")
WHERE "graphNodeId" IS NOT NULL
  AND "status" IN ('pending', 'processing');
