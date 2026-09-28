/**
 * Relay a running job's preview images to the browser.
 *
 * The engine's event stream is not reachable from the page: it needs an
 * `Authorization` header, which `EventSource` cannot send, and the key belongs
 * on this side of the wire anyway. So this route holds the upstream stream open
 * and forwards only the frames the node draws.
 *
 * Newline-delimited JSON rather than SSE, because the client reads it with
 * `fetch` (the only way to send the engine headers) and NDJSON needs no framing
 * beyond `split("\n")`. Nothing here is authoritative: previews are decoration
 * on top of the poll loop, which remains the source of truth for whether a run
 * finished and what it produced.
 */

import { NextRequest, NextResponse } from "next/server";

import { engineFromRequest } from "@/lib/comfy/server";
import type { ComfyPreviewFrame } from "@/lib/comfy/server/engine";
import { comfyErrorResponse } from "../shared";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface ComfyPreviewRequest {
  jobId: string;
}

/**
 * One frame, as the client receives it.
 *
 * An alias rather than a second declaration: the route forwards what the engine
 * yields verbatim, so a field added on one side has to appear on the other.
 */
export type ComfyPreviewMessage = ComfyPreviewFrame;

export async function POST(request: NextRequest) {
  // Outside the try: a body that is not JSON, or a job id that is not a string,
  // is the caller's mistake. Left to `comfyErrorResponse` the `SyntaxError`
  // becomes a 500, which reads as "the engine broke".
  let body: ComfyPreviewRequest;
  try {
    body = (await request.json()) as ComfyPreviewRequest;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body?.jobId !== "string" || body.jobId === "") {
    return NextResponse.json({ success: false, error: "No job id" }, { status: 400 });
  }

  try {
    const { engine } = engineFromRequest(request);
    // A stock ComfyUI has no event stream. Answering "nothing here" is the
    // honest reply, and the caller simply keeps its spinner.
    if (!engine.previews) return new NextResponse(null, { status: 204 });

    const frames = engine.previews(body.jobId, request.signal);
    const encoder = new TextEncoder();

    // The platform calls `cancel()` when the browser disconnects, and the
    // controller is closed from that moment. Closing it again throws
    // `TypeError: Invalid state` out of a promise nothing awaits — an unhandled
    // rejection in the server log every time someone navigates away mid-render.
    let closed = false;
    const close = (controller: ReadableStreamDefaultController<Uint8Array>) => {
      if (closed) return;
      closed = true;
      controller.close();
    };

    const stream = new ReadableStream<Uint8Array>({
      // One frame per pull, not a loop that drains the engine as fast as it
      // emits. `enqueue` never blocks, so draining upstream would pile frames
      // up in server memory whenever the browser reads slower than the render
      // produces — a backgrounded tab, say — and each one is ~100KB of base64
      // on a route that stays open for minutes.
      async pull(controller) {
        try {
          const next = await frames.next();
          if (next.done) {
            close(controller);
            return;
          }
          controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`));
        } catch {
          // A dropped upstream stream ends this one. It says nothing about the
          // job, which the poll loop is watching regardless, so it is closed
          // quietly rather than raised as a failure the user would have to read.
          close(controller);
        }
      },
      cancel() {
        closed = true;
        // The browser navigated away or the run ended; let the generator's
        // `finally` close the upstream connection.
        // Caught: the cleanup is a promise, and a rejection from it on a
        // disconnect would be as unhandled as the double close above.
        void frames.return(undefined).catch(() => undefined);
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store, no-transform",
        // Proxies that buffer would defeat the point of streaming at all.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return comfyErrorResponse(error);
  }
}
