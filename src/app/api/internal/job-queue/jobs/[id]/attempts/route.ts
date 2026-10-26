import { queueConsoleRead } from "@/server/job-queue/job-queue-console-http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return queueConsoleRead(request, "attempts", (await context.params).id);
}
