import { queueAdminMutation } from "@/server/job-queue/job-queue-admin-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = async (request: Request, context: { params: Promise<{ id: string }> }) => queueAdminMutation(request, (await context.params).id, "reconcile");
