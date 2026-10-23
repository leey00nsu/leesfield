import { queueAdminRead } from "@/server/job-queue/job-queue-admin-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = async (request: Request, context: { params: Promise<{ id: string }> }) => queueAdminRead(request, (await context.params).id);
