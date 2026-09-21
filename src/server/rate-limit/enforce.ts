import {
  buildRateLimitedResponse,
  buildRateLimitUnavailableResponse,
} from "@/server/http/response";
import { getServerEnv } from "@/server/runtime/env";
import { logSafeError } from "@/server/observability/request-observability";

import { consumeRateLimit, type RateLimitPolicy } from "./limiter";

const warnedPolicies = new Set<string>();

function warnSkippedOnce(policyName: string, error: unknown): void {
  if (warnedPolicies.has(policyName)) return;
  warnedPolicies.add(policyName);
  logSafeError("rate_limit.store_skipped", error, { operation: policyName });
}

function isEnforcedRuntime(): boolean {
  try {
    return getServerEnv().isProduction;
  } catch {
    return false;
  }
}

/**
 * Returns a response when the shared budget is exhausted or unreachable.
 * Callers keep their handler unchanged when it returns null.
 *
 * A serving process always has the shared store configured, so an unreachable
 * bucket store fails closed there. Outside production (local runs, tests) the
 * store may simply not be provisioned; admission is skipped with a warning
 * instead of turning every request into an outage.
 */
export async function enforceRateLimit(
  policy: RateLimitPolicy,
  subject: string,
): Promise<Response | null> {
  try {
    const outcome = await consumeRateLimit(policy, subject);
    if (outcome.allowed) return null;
    return buildRateLimitedResponse(outcome.retryAfterSeconds);
  } catch (error) {
    if (!isEnforcedRuntime()) {
      warnSkippedOnce(policy.name, error);
      return null;
    }
    logSafeError("rate_limit.store_unavailable", error, {
      operation: policy.name,
    });
    return buildRateLimitUnavailableResponse();
  }
}
