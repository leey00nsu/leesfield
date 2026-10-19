import { externalSpaceResponseSchema } from "@/shared/api/spaces-contract";
import type { GenerationGraphSnapshot } from "@/server/generation-graph/generation-graph-repository";

export function externalSpaceDto(space: GenerationGraphSnapshot) {
  const { id, title, version, schemaVersion, minimumWriterVersion, nodes, edges, groups, outputBindings, writable, readOnlyReason } = space;
  return externalSpaceResponseSchema.parse({ space: { id, title, version, schemaVersion, minimumWriterVersion, nodes, edges, groups, outputBindings, writable, readOnlyReason, createdAt: space.createdAt.toISOString(), updatedAt: space.updatedAt.toISOString() } });
}
