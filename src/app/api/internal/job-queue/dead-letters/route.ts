import { queueAdminRead } from "@/server/job-queue/job-queue-admin-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) => queueAdminRead(request);
