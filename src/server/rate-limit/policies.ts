import type { RateLimitPolicy } from "./limiter";

/**
 * Admission budgets for a small single-owner deployment: burst-tolerant but
 * bounded per minute, and shared across processes through PostgreSQL.
 */
export const RATE_LIMITS = {
  loginIp: { name: "login-ip", capacity: 5, refillPerSecond: 5 / 60 },
  loginAccount: {
    name: "login-account",
    capacity: 20,
    refillPerSecond: 20 / (15 * 60),
  },
  generationOwner: {
    name: "generation-owner",
    capacity: 3,
    refillPerSecond: 10 / 60,
  },
  generationKey: { name: "generation-key", capacity: 3, refillPerSecond: 10 / 60 },
  uploadOwner: { name: "upload-owner", capacity: 2, refillPerSecond: 10 / 60 },
  statsOwner: { name: "stats-owner", capacity: 5, refillPerSecond: 30 / 60 },
  readOwner: { name: "read-owner", capacity: 30, refillPerSecond: 2 },
} satisfies Record<string, RateLimitPolicy>;

/** Subject used when the client address is unknown or untrusted. */
export const UNKNOWN_CLIENT_SUBJECT = "unknown";
