import { ZodError } from "zod";
import { getSession } from "@/server/auth/session";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
import { SpacePreferenceError, spacePreferencesRepository } from "@/server/generation-graph/space-preferences-repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function handle(request?: Request) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) return buildErrorResponse("UNAUTHORIZED", 401);
  try {
    const preferences = request
      ? await spacePreferencesRepository.update(session.adminEmail, await request.json().catch(() => null))
      : await spacePreferencesRepository.get(session.adminEmail);
    return jsonWithNoStore({ preferences });
  } catch (error) {
    if (error instanceof ZodError) return buildErrorResponse("SPACE_PREFERENCES_INVALID", 400);
    if (error instanceof SpacePreferenceError) return buildErrorResponse(error.code, error.status);
    console.error("[space-preferences] request failed", error);
    return buildErrorResponse("SPACE_PREFERENCES_UNAVAILABLE", 503);
  }
}
export function GET() { return handle(); }
export function PATCH(request: Request) { return handle(request); }
