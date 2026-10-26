import { queueConsoleRead } from "@/server/job-queue/job-queue-console-http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = (request: Request) => queueConsoleRead(request, "timeline");
