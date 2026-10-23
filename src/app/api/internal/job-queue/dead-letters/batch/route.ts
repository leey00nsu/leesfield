import { queueAdminBatch } from "@/server/job-queue/job-queue-admin-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = (request: Request) => queueAdminBatch(request);
