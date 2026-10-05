import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { readRouteJsonBody } from "@/server/http/bounded-body";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
import { logSafeError } from "@/server/observability/request-observability";
import { PromptPresetError } from "./prompt-preset-errors";

export async function withPromptPresetRoute(
  request: Request,
  action: (ownerEmail: string, body: unknown) => Promise<unknown>,
  options: { mutation?: boolean; status?: number } = {},
): Promise<Response> {
  const session = await getSession();
  if (!session.isLoggedIn || !session.adminEmail) return buildErrorResponse("UNAUTHORIZED", 401);
  let body: unknown = undefined;
  if (options.mutation) {
    const originError = assertSessionMutationOrigin(request);
    if (originError) return originError;
    const bounded = await readRouteJsonBody(request, 96 * 1024);
    if (!bounded.ok) return buildErrorResponse(bounded.code, bounded.status);
    body = bounded.body;
  }
  try {
    return jsonWithNoStore(await action(session.adminEmail, body), { status: options.status ?? 200 });
  } catch (error) {
    if (error instanceof PromptPresetError) return buildErrorResponse(error.code, error.status);
    logSafeError("prompt_preset.request_failed", error);
    return buildErrorResponse("DB_SAVE_FAILED", 500);
  }
}
