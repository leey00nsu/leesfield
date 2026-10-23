import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getSession } from "@/server/auth/session";
import { resolveLocalAuthBypass } from "@/server/auth/local-auth-bypass";
import { getServerEnv } from "@/server/runtime/env";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { readValidatedJsonBody } from "@/server/http/bounded-body";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { logSafeError } from "@/server/observability/request-observability";
import { listQueueDeadLetters, getQueueDeadLetter } from "./job-queue-dlq";
import { operateQueue, auditQueueRejection, queueOperatorInputSchema, type QueueOperation } from "./job-queue-operations";
import { QueueContractError } from "./contracts";

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item),
    { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
export async function queueAdminBudget(actor: string, action: QueueOperation = "redrive") {
  const limited = await enforceRateLimit({ name: "queue-admin-actor", capacity: 10, refillPerSecond: 10 / 60 }, actor)
    ?? await enforceRateLimit({ name: "queue-admin-global", capacity: 30, refillPerSecond: 30 / 60 }, "all");
  if (limited) await auditQueueRejection(actor, action, "QUEUE_RATE_LIMITED");
  return limited;
}
async function authorize(request: Request, action?: QueueOperation): Promise<string | Response> {
  const session = await getSession();
  const env = getServerEnv();
  const expected = env.isProduction ? env.adminEmail : resolveLocalAuthBypass()?.adminEmail ?? env.adminEmail;
  if (!session.isLoggedIn || !session.adminEmail || !expected || session.adminEmail !== expected) {
    await auditQueueRejection(session.adminEmail ?? "anonymous", action ?? "redrive", "QUEUE_ADMIN_REQUIRED");
    return json({ message: "UNAUTHORIZED" }, 401);
  }
  if (action) {
    const originError = assertSessionMutationOrigin(request);
    if (originError) {
      await auditQueueRejection(session.adminEmail, action, "QUEUE_ORIGIN_REJECTED");
      return originError;
    }
  }
  return session.adminEmail;
}
function failure(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ message: "INVALID_REQUEST" }, 400);
  if (error instanceof QueueContractError) return json({ message: error.code }, error.code === "QUEUE_PAUSED" ? 503 : 409);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return json({ message: "NOT_FOUND" }, 404);
  logSafeError("queue.admin.failed", error, { worker: "shared-queue", phase: "admin.request" });
  return json({ message: "QUEUE_ADMIN_UNAVAILABLE" }, 503);
}
export async function queueAdminRead(request: Request, id?: string) {
  try {
    const auth = await authorize(request);
    if (auth instanceof Response) return auth;
    return json(id ? await getQueueDeadLetter(id) : await listQueueDeadLetters(Object.fromEntries(new URL(request.url).searchParams)));
  } catch (error) { return failure(error); }
}
export async function queueAdminMutation(request: Request, id: string, action: QueueOperation) {
  let actor: string | undefined;
  try {
    const auth = await authorize(request, action);
    if (auth instanceof Response) return auth;
    actor = auth;
    const limited = await queueAdminBudget(actor, action);
    if (limited) return limited;
    const body = await readValidatedJsonBody(request, 16_384);
    if (!body.ok) return json({ message: body.message }, body.status);
    const outcome = await operateQueue(actor, action, id, body.body);
    return json(outcome, outcome.outcome === "rejected" ? 409 : 200);
  } catch (error) {
    if (actor && (error instanceof z.ZodError || error instanceof SyntaxError)) await auditQueueRejection(actor, action, "QUEUE_INPUT_REJECTED");
    return failure(error);
  }
}
const batchSchema = z.object({
  action: z.enum(["redrive", "reconcile", "abandon"]),
  items: z.array(queueOperatorInputSchema.extend({ id: z.string().uuid() })).min(1).max(20),
}).strict();
export async function queueAdminBatch(request: Request) {
  let actor: string | undefined;
  try {
    const auth = await authorize(request, "redrive");
    if (auth instanceof Response) return auth;
    actor = auth;
    const body = await readValidatedJsonBody(request, 32_768);
    if (!body.ok) return json({ message: body.message }, body.status);
    const input = batchSchema.parse(body.body);
    const items = [];
    for (const { id, ...operation } of input.items) {
      const limited = await queueAdminBudget(auth, input.action);
      if (limited) { items.push({ id, status: limited.status, code: "QUEUE_RATE_LIMITED" }); continue; }
      try { const outcome = await operateQueue(auth, input.action, id, operation); items.push({ id, status: outcome.outcome === "rejected" ? 409 : 200, ...outcome }); }
      catch (error) { const response = failure(error); items.push({ id, status: response.status, ...await response.json() }); }
    }
    return json({ items });
  } catch (error) {
    if (actor && (error instanceof z.ZodError || error instanceof SyntaxError)) await auditQueueRejection(actor, "redrive", "QUEUE_BATCH_REJECTED");
    return failure(error);
  }
}
