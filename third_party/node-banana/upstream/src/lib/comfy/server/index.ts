/**
 * Server-side ComfyUI plumbing: pick an engine for a connection, and keep a
 * short-lived cache of node catalogs.
 */

import type { ComfyConnection, ComfyObjectInfo } from "../types";
import { connectionFromRequest, ComfyConfigError, orgKeyFromRequest } from "./connection";
import type { ComfyEngine } from "./engine";
import { LegacyComfyEngine } from "./legacyEngine";
import { SdkComfyEngine } from "./sdkEngine";

export { ComfyConfigError, connectionFromRequest, orgKeyFromRequest } from "./connection";
export { ComfyEngineError } from "./engine";
export type {
  ComfyEngine,
  ComfyJobState,
  ComfyOutputAsset,
  ComfyUploadInput,
} from "./engine";

/**
 * The engine for a connection.
 *
 * `useSdk` is the whole decision: a Comfy API v2 endpoint (Comfy Cloud, or a
 * self-hosted install behind `comfy-api-proxy`) gets the SDK with its asset
 * dedup and idempotent submits; anything else gets the legacy HTTP surface,
 * which every stock ComfyUI serves.
 */
export function createEngine(connection: ComfyConnection): ComfyEngine {
  return connection.useSdk ? new SdkComfyEngine(connection) : new LegacyComfyEngine(connection);
}

/** The engine this request targets, plus the partner-node key to run it with. */
export function engineFromRequest(request: Request): {
  engine: ComfyEngine;
  connection: ComfyConnection;
  orgApiKey: string | null;
} {
  const connection = connectionFromRequest(request);
  return {
    engine: createEngine(connection),
    connection,
    orgApiKey: orgKeyFromRequest(request, connection),
  };
}

/* ── node catalog cache ────────────────────────────────────────── */

interface CatalogEntry {
  at: number;
  /** Shared in-flight (or settled) fetch, so concurrent imports don't stampede. */
  catalog: Promise<ComfyObjectInfo>;
}

const CATALOG_TTL_MS = 5 * 60_000;
const catalogCache = new Map<string, CatalogEntry>();

/**
 * The engine's node catalog, cached per endpoint.
 *
 * `/api/object_info` is megabytes of JSON and every editor-format import needs
 * it, so refetching per request would dominate import latency. The cache is
 * keyed by base URL — two users pointing at the same engine share it, which is
 * safe because the catalog is a property of the engine, not of the caller.
 *
 * There is deliberately no `signal`: the fetch is shared, so no one caller may
 * abort it, and taking a signal only to ignore it advertises a cancellation
 * that cannot happen.
 */
export async function getObjectInfo(
  engine: ComfyEngine,
  options: { force?: boolean } = {}
): Promise<ComfyObjectInfo> {
  const key = engine.connection.baseUrl;
  const cached = catalogCache.get(key);
  if (!options.force && cached && Date.now() - cached.at < CATALOG_TTL_MS) {
    return cached.catalog;
  }
  const entry: CatalogEntry = {
    at: Date.now(),
    // Deliberately NOT passing the caller's signal: this promise is shared with
    // every concurrent request for the same engine, so one client disconnecting
    // would abort the catalog fetch out from under the others.
    catalog: engine.objectInfo(),
  };
  catalogCache.set(key, entry);
  // A failed probe must not be cached, or a transient outage poisons imports
  // for the whole TTL.
  entry.catalog.catch(() => catalogCache.delete(key));
  return entry.catalog;
}

/** Drop a cached catalog — used when the user reconnects to a new engine. */
export function invalidateObjectInfo(baseUrl?: string): void {
  if (baseUrl) catalogCache.delete(baseUrl);
  else catalogCache.clear();
}
