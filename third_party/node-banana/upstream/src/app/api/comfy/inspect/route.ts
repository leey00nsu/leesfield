/**
 * Inspect an uploaded ComfyUI workflow and propose a node contract.
 *
 * The client posts the file exactly as ComfyUI saved it — no "export it
 * differently" step. Editor-format saves are converted here, using the
 * configured engine's node catalog, and their App Mode configuration becomes
 * the proposed inputs, parameters and outputs.
 */

import { NextRequest, NextResponse } from "next/server";

import { engineFromRequest } from "@/lib/comfy/server";
import { inspectUpload } from "@/lib/comfy/server/import";
import type { ComfyGraph, ComfyWorkflowInspection } from "@/lib/comfy/types";
import { comfyErrorResponse } from "../shared";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** Guard against a paste that would blow out memory before it is parsed. */
const MAX_WORKFLOW_BYTES = 25 * 1024 * 1024;

interface InspectRequest {
  /** The workflow JSON, in either editor or API format. */
  workflow: unknown;
  /** Original filename — seeds the app's default name. */
  filename?: string;
  /** When set, inspect this blueprint out of the file instead of the workflow. */
  blueprintId?: string;
}

export interface ComfyInspectResponse extends ComfyWorkflowInspection {
  success: true;
  /** The executable graph, stored with the app so it stays runnable. */
  graph: ComfyGraph;
}

/** `flux-portrait_v2.json` → `Flux Portrait V2`. */
function nameFromFilename(filename: string | undefined): string {
  if (!filename) return "";
  return filename
    .replace(/\.json$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    // Bytes, not `raw.length`: that counts UTF-16 code units, so a workflow of
    // three-byte characters would sail past a cap named in bytes at roughly
    // three times its size.
    if (Buffer.byteLength(raw, "utf8") > MAX_WORKFLOW_BYTES) {
      return NextResponse.json(
        { success: false, error: "That workflow file is too large to import." },
        { status: 413 }
      );
    }

    let body: InspectRequest;
    try {
      body = JSON.parse(raw) as InspectRequest;
    } catch {
      return NextResponse.json(
        { success: false, error: "That file is not valid JSON." },
        { status: 400 }
      );
    }

    if (!body.workflow) {
      return NextResponse.json(
        { success: false, error: "No workflow was provided." },
        { status: 400 }
      );
    }

    // An API-format export needs no engine at all, so a missing connection is
    // only fatal once conversion turns out to be required — which the import
    // pipeline decides, not this route.
    let engine = null;
    try {
      engine = engineFromRequest(request).engine;
    } catch {
      engine = null;
    }

    const inspection = await inspectUpload(body.workflow, engine, {
      ...(body.blueprintId ? { blueprintId: body.blueprintId } : {}),
      defaultName: nameFromFilename(body.filename),
      signal: request.signal,
    });

    return NextResponse.json<ComfyInspectResponse>({ success: true, ...inspection });
  } catch (error) {
    return comfyErrorResponse(error);
  }
}
