import net from "node:net";

import { getServerEnv } from "@/server/runtime/env";

import { UNKNOWN_CLIENT_SUBJECT } from "@/server/rate-limit/policies";

export type ClientIpEnv = {
  trustProxyHeaders: boolean;
  trustedProxyHops: number;
};

/**
 * Resolves the client address used for admission decisions.
 *
 * Forwarded headers are attacker-controlled unless a proxy overwrites them, so
 * they are ignored by default and only read when the deployment explicitly
 * declares a trusted proxy. The rightmost hop is the one our own proxy wrote.
 */
export function resolveClientIp(
  source: { headers: Headers },
  env: ClientIpEnv = getServerEnv(),
): string | null {
  if (!env.trustProxyHeaders) return null;

  const header = source.headers.get("x-forwarded-for");
  if (!header) return null;

  const parts = header
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const hops = Math.max(1, env.trustedProxyHops);
  const index = parts.length - hops;
  // A shorter chain than declared means the header cannot be trusted.
  if (index < 0) return null;
  const candidate = parts[index] as string;
  const normalized = candidate.replace(/^\[(.*)\]$/, "$1");
  return net.isIP(normalized) ? normalized : null;
}

export function resolveClientSubject(
  source: { headers: Headers },
  env?: ClientIpEnv,
): string {
  return resolveClientIp(source, env) ?? UNKNOWN_CLIENT_SUBJECT;
}
