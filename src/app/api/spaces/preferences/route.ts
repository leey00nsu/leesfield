import { ZodError } from "zod";
import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
import {
  JSON_BODY_LIMIT_BYTES,
  readRouteJsonBody,
} from "@/server/http/bounded-body";
import { SpacePreferenceError, spacePreferencesRepository } from "@/server/generation-graph/space-preferences-repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function handle(request?: Request) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) return buildErrorResponse("UNAUTHORIZED", 401);
  try {
    let preferences;
    if (request) {
      const bounded = await readRouteJsonBody(request, JSON_BODY_LIMIT_BYTES);
      if (!bounded.ok) return buildErrorResponse(bounded.code, bounded.status);
      preferences = await spacePreferencesRepository.update(
        session.adminEmail,
        bounded.body,
      );
    } else {
      preferences = await spacePreferencesRepository.get(session.adminEmail);
    }
    return jsonWithNoStore({ preferences });
  } catch (error) {
    if (error instanceof ZodError) return buildErrorResponse("SPACE_PREFERENCES_INVALID", 400);
    if (error instanceof SpacePreferenceError) return buildErrorResponse(error.code, error.status);
    logSafeError("space_preference.request_failed", error);
    return buildErrorResponse("SPACE_PREFERENCES_UNAVAILABLE", 503);
  }
}
export function GET() { return handle(); }
export function PATCH(request: Request) {
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;
  return handle(request);
}
import { logSafeError } from "@/server/observability/request-observability";
