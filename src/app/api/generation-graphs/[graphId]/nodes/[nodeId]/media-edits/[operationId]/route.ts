import { directEditHttp } from "@/server/media-edits/direct-edit-http";
import { withRequestObservability } from "@/server/observability/request-observability";
export const dynamic = "force-dynamic";
const handler = async (request: Request, context: { params: Promise<{ graphId: string; nodeId: string; operationId: string }> }) => directEditHttp(request, await context.params);
export const GET = withRequestObservability("/api/generation-graphs/[graphId]/nodes/[nodeId]/media-edits/[operationId]", handler);
export const DELETE = withRequestObservability("/api/generation-graphs/[graphId]/nodes/[nodeId]/media-edits/[operationId]", handler);
