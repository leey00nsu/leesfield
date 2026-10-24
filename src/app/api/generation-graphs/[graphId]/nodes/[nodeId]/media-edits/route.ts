import { directEditHttp } from "@/server/media-edits/direct-edit-http";
import { withRequestObservability } from "@/server/observability/request-observability";
export const dynamic = "force-dynamic";
export const POST = withRequestObservability("/api/generation-graphs/[graphId]/nodes/[nodeId]/media-edits",
  async (request: Request, context: { params: Promise<{ graphId: string; nodeId: string }> }) => directEditHttp(request, await context.params));
