import { ZodError } from "zod";
import { withExternalApi } from "./route-handler";
import type { ApiKeyAuthContext } from "@/server/auth/api-key-guard";
import { buildGenerationGraphKnownErrorResponse } from "@/server/generation-graph/generation-graph-http";
import { buildMediaAssetKnownErrorResponse } from "@/server/media-assets/media-asset-http";
import { buildInvalidRequestResponse } from "@/server/http/response";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";
import { nodeExecutionErrorResponse } from "@/server/node-executions/node-execution-http";

export function withSpaceApi(request: Request, handler: (auth: ApiKeyAuthContext) => Promise<Response>, budget: "read" | "write" | "upload" | "execute" = "read") {
  return withExternalApi(request, async auth => {
    const limited = await enforceRateLimit(budget === "execute" ? RATE_LIMITS.generationOwner : budget === "upload" ? RATE_LIMITS.uploadOwner : budget === "write" ? RATE_LIMITS.assetWriteOwner : RATE_LIMITS.readOwner, auth.ownerEmail);
    if (limited) return limited;
    if (budget === "execute") {
      const keyLimited = await enforceRateLimit(RATE_LIMITS.generationKey, auth.apiKeyId);
      if (keyLimited) return keyLimited;
    }
    try { return await handler(auth); }
    catch (error) {
      if (error instanceof ZodError) return buildInvalidRequestResponse(error.flatten());
      const known = nodeExecutionErrorResponse(error) ?? buildGenerationGraphKnownErrorResponse(error) ?? buildMediaAssetKnownErrorResponse(error);
      if (known) return known;
      throw error;
    }
  });
}

