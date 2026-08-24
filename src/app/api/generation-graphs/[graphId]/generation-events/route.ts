import { getSession } from "@/server/auth/session";
import { GenerationGraphNotFoundError } from "@/server/generation-graph/generation-graph-errors";
import { generationGraphService } from "@/server/generation-graph/generation-graph-service";
import {
  generationEventId,
  type GenerationUpdatedEvent,
} from "@/shared/generation-events/generation-event-contract";
import {
  getGenerationEventBroker,
  type GenerationEventBrokerState,
} from "@/server/generation-events/generation-event-broker";
import { buildErrorResponse } from "@/server/http/response";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const HEARTBEAT_INTERVAL_MS = 15_000;
const encoder = new TextEncoder();

type RouteContext = { params: Promise<{ graphId: string }> };

function eventFrame(event: string, data: unknown, id?: string) {
  return `${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function generationFrame(event: GenerationUpdatedEvent) {
  return eventFrame("generation.updated", event, generationEventId(event));
}

async function authenticatedOwnerEmail() {
  const session = await getSession();
  return session.isLoggedIn ? session.adminEmail ?? null : null;
}

export async function GET(request: Request, context: RouteContext) {
  const ownerEmail = await authenticatedOwnerEmail();
  if (!ownerEmail) return buildErrorResponse("UNAUTHORIZED", 401);

  const { graphId } = await context.params;
  try {
    await generationGraphService.get(ownerEmail, graphId);
  } catch (error) {
    if (error instanceof GenerationGraphNotFoundError) {
      return buildErrorResponse("GRAPH_NOT_FOUND", 404);
    }
    console.error("[generation-events] graph lookup failed", error);
    return buildErrorResponse("DB_READ_FAILED", 500);
  }

  const broker = getGenerationEventBroker();
  let cleanup: () => void = () => undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let readySent = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: () => void = () => undefined;

      const enqueue = (frame: string) => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(frame));
          return true;
        } catch {
          close();
          return false;
        }
      };

      const release = () => {
        request.signal.removeEventListener("abort", close);
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        unsubscribe();
        unsubscribe = () => undefined;
      };

      const close = () => {
        if (closed) return;
        closed = true;
        release();
        try {
          controller.close();
        } catch {
          // A canceled reader can close the controller before route cleanup runs.
        }
      };

      const onState = (state: GenerationEventBrokerState) => {
        if (state === "connected" && !readySent) {
          readySent = enqueue(
            eventFrame("stream.ready", { version: 1, graphId }),
          );
        }
        if (state === "degraded") {
          enqueue(eventFrame("stream.degraded", { version: 1 }));
          close();
        }
      };

      const brokerUnsubscribe = broker.subscribe(graphId, {
        onEvent: (event) => enqueue(generationFrame(event)),
        onState,
      });
      unsubscribe = brokerUnsubscribe;
      if (closed) {
        unsubscribe();
        unsubscribe = () => undefined;
        return;
      }
      heartbeat = setInterval(() => {
        const now = new Date().toISOString();
        enqueue(
          `: heartbeat ${now}\n${eventFrame("stream.heartbeat", { version: 1, at: now })}`,
        );
      }, HEARTBEAT_INTERVAL_MS);
      request.signal.addEventListener("abort", close, { once: true });
      if (request.signal.aborted) close();
      cleanup = close;
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
