import { withExternalApi } from "@/server/external-api/route-handler";
import { readRouteJsonBody } from "@/server/http/bounded-body";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
import { PromptPresetError } from "./prompt-preset-errors";

export function withExternalPromptPresetRoute(request: Request,
  action: (ownerEmail: string, body: unknown) => Promise<unknown>,
  options: { mutation?: boolean; status?: number } = {},
) {
  return withExternalApi(request, async (auth) => {
    const limited = await enforceRateLimit(RATE_LIMITS.readOwner, auth.ownerEmail);
    if (limited) return limited;
    let body: unknown;
    if (options.mutation) {
      const parsed = await readRouteJsonBody(request, 96 * 1024);
      if (!parsed.ok) return buildErrorResponse(parsed.code, parsed.status);
      body = parsed.body;
    }
    try { return jsonWithNoStore(await action(auth.ownerEmail, body), { status: options.status ?? 200 }); }
    catch (error) {
      if (error instanceof PromptPresetError) return buildErrorResponse(error.code, error.status);
      throw error;
    }
  }, options.mutation ? "platform:write" : "platform:read");
}
