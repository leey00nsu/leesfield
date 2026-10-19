import { withExternalApi } from "@/server/external-api/route-handler";
import { readExternalJsonBody, JSON_BODY_LIMIT_BYTES } from "@/server/http/bounded-body";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
import { z } from "zod";

export function withExternalModelAdmin(request: Request,
  action: (body: unknown) => Promise<unknown>,
  options: { body?: boolean; maxBytes?: number; status?: number } = {},
) {
  return withExternalApi(request, async (auth) => {
    const limited = await enforceRateLimit(RATE_LIMITS.readOwner, auth.ownerEmail);
    if (limited) return limited;
    let body: unknown;
    if (options.body) {
      const parsed = await readExternalJsonBody(request, options.maxBytes ?? JSON_BODY_LIMIT_BYTES);
      if (!parsed.ok) return buildErrorResponse(parsed.code, parsed.status);
      body = parsed.body;
    }
    try {
      const result = await action(body);
      return result instanceof Response ? result : jsonWithNoStore(result, { status: options.status ?? 200 });
    }
    catch (error) {
      if (error instanceof z.ZodError) return buildErrorResponse("INVALID_PAYLOAD", 400);
      const code = error instanceof Error ? error.message : "";
      if (code === "MODEL_NOT_FOUND") return buildErrorResponse("NOT_FOUND", 404);
      if (code === "MODEL_KEY_EXISTS") return buildErrorResponse("CONFLICT", 409);
      if (code === "TYPE_IMMUTABLE" || code === "KEY_IMMUTABLE") return buildErrorResponse("IMMUTABLE_FIELD", 400);
      if (["INVALID_PAYLOAD", "MODEL_API_KEY_REQUIRED", "MODEL_API_KEY_INVALID"].includes(code)) return buildErrorResponse(code, 400);
      if (code.startsWith("MODEL_CREDENTIAL_ENCRYPTION_KEY_")) return buildErrorResponse("MODEL_CREDENTIAL_UNAVAILABLE", 503);
      throw error;
    }
  }, "platform:admin");
}
