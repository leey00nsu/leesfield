/**
 * Submit one Comfy app run.
 *
 * Returns as soon as the job is queued rather than waiting for it. A diffusion
 * run routinely takes longer than a serverless invocation is allowed to live,
 * so the client polls `/api/comfy/poll` for the result — the same shape the
 * long-running video providers already use.
 */

import { NextRequest, NextResponse } from "next/server";

import { engineFromRequest } from "@/lib/comfy/server";
import {
  buildRunGraph,
  hashSeed,
  newRunTag,
  uploadInputs,
  type ResolvedInputMedia,
} from "@/lib/comfy/server/run";
import type { ComfyAppDefinition } from "@/lib/comfy/types";
import { comfyErrorResponse, decodeDataUrl, uploadFilename } from "../shared";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface ComfyRunRequest {
  /** The app contract, embedded in the node so it stays runnable. */
  app: ComfyAppDefinition;
  /**
   * Connected inputs keyed by `ComfyAppInput.name`. Media arrives as a data
   * URL; text arrives as a plain string.
   */
  inputs: Record<string, string>;
  /** Inline parameter values keyed by `ComfyAppParam.id`. */
  params?: Record<string, unknown>;
  /** Re-randomise unpinned seed widgets so repeat runs vary. */
  randomizeSeeds?: boolean;
  /** Stable key making a run's seed reproducible within that run. */
  seedKey?: string;
}

export interface ComfyRunResponse {
  success: true;
  polling: true;
  jobId: string;
  status: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ComfyRunRequest;
    const app = body?.app;
    if (!app?.graph || !Array.isArray(app.inputs)) {
      return NextResponse.json(
        { success: false, error: "This node has no ComfyUI workflow attached yet." },
        { status: 400 }
      );
    }

    const { engine, orgApiKey } = engineFromRequest(request);
    const inputs = body.inputs ?? {};

    // One predicate for both decisions below. Splitting them let an input be
    // "present" for the required check (anything but `undefined`) and "absent"
    // for the split loop (anything but a non-empty string), so an empty string
    // sent for a required input passed validation and then reached the engine
    // unset — a curated 400 replaced by a render from a stale widget value.
    const provided = (name: string): boolean => {
      const value = inputs[name];
      return typeof value === "string" && value !== "";
    };

    // Reported before any media is decoded and hashed: there is no point
    // spending that on a run that cannot be submitted.
    const missingRequired = app.inputs
      .filter((input) => input.required && !provided(input.name))
      .map((input) => input.label);
    if (missingRequired.length > 0) {
      return NextResponse.json(
        { success: false, error: `Missing required input: ${missingRequired.join(", ")}` },
        { status: 400 }
      );
    }

    // Split connected inputs by handle type: text is patched straight into the
    // graph, media has to reach the engine's storage first.
    const text: Record<string, string> = {};
    const media: ResolvedInputMedia[] = [];
    const unreadable: string[] = [];

    for (const input of app.inputs) {
      const value = inputs[input.name];
      if (!provided(input.name)) continue;
      if (input.type === "text") {
        text[input.name] = value;
        continue;
      }
      const decoded = decodeDataUrl(value);
      if (!decoded) {
        unreadable.push(input.label);
        continue;
      }
      media.push({
        name: input.name,
        bytes: decoded.bytes,
        filename: uploadFilename(input.name, decoded.contentType, decoded.bytes),
        contentType: decoded.contentType,
      });
    }

    if (unreadable.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Could not read the media connected to ${unreadable.join(", ")}.`,
        },
        { status: 400 }
      );
    }

    const uploads = await uploadInputs(engine, media, request.signal);

    const graph = buildRunGraph({
      app,
      text,
      uploads,
      params: body.params ?? {},
      ...(body.randomizeSeeds === false
        ? {}
        : { seed: hashSeed(body.seedKey ?? crypto.randomUUID()) }),
      // Always, regardless of `randomizeSeeds`: this is what makes a repeat run
      // produce a result at all, not what makes it produce a *different* one.
      runTag: newRunTag(),
    });

    const jobId = await engine.submit(graph, {
      orgApiKey,
      signal: request.signal,
    });

    return NextResponse.json<ComfyRunResponse>({
      success: true,
      polling: true,
      jobId,
      status: "queued",
    });
  } catch (error) {
    return comfyErrorResponse(error);
  }
}
