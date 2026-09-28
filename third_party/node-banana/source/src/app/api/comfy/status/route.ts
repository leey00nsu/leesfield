/**
 * Connection probe for the ComfyUI settings panel.
 *
 * Answers three things in one round trip: is the engine reachable, does it
 * accept the key, and how many node types does it know (which is what makes
 * "can this workflow run here?" answerable later).
 */

import { NextRequest, NextResponse } from "next/server";

import { engineFromRequest, getObjectInfo, invalidateObjectInfo } from "@/lib/comfy/server";
import { comfyErrorResponse } from "../shared";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export interface ComfyStatusResponse {
  success: true;
  connected: boolean;
  mode: string;
  baseUrl: string;
  /** Reachability detail, shown under the connection row. */
  detail: string;
  /** Whether this endpoint is being driven through the Comfy API v2. */
  apiV2: boolean;
  /** Number of node types the engine knows, when the catalog was readable. */
  nodeCount: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const { engine, connection } = engineFromRequest(request);

    // The user is explicitly re-testing, so never answer from a stale catalog.
    invalidateObjectInfo(connection.baseUrl);

    const ping = await engine.ping(request.signal);
    let nodeCount: number | null = null;
    if (ping.ok) {
      const catalog = await getObjectInfo(engine).catch(() => null);
      nodeCount = catalog ? Object.keys(catalog).length : null;
    }

    return NextResponse.json<ComfyStatusResponse>({
      success: true,
      connected: ping.ok,
      mode: connection.mode,
      baseUrl: connection.baseUrl,
      detail: ping.detail,
      apiV2: connection.useSdk,
      nodeCount,
    });
  } catch (error) {
    return comfyErrorResponse(error);
  }
}
