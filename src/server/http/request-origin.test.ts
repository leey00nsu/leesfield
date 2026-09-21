// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/runtime/env", () => ({
  getServerEnv: () => ({ appOrigin: "https://studio.example.com" }),
}));

import { assertSessionMutationOrigin, isAllowedRequestOrigin } from "./request-origin";

const SESSION_COOKIE = "leesfield_session=abc";

function mutation(
  origin: string | null,
  cookie: string | null = SESSION_COOKIE,
  extra: Record<string, string> = {},
): Request {
  const headers: Record<string, string> = { host: "studio.example.com", ...extra };
  if (origin !== null) headers.origin = origin;
  if (cookie !== null) headers.cookie = cookie;
  return new Request("https://studio.example.com/api/generation", {
    method: "POST",
    headers,
    body: "{}",
  });
}

describe("assertSessionMutationOrigin", () => {
  it("allows a session mutation from the configured origin", () => {
    expect(assertSessionMutationOrigin(mutation("https://studio.example.com"))).toBeNull();
  });

  it("allows a same-host origin behind the current proxy", () => {
    expect(
      assertSessionMutationOrigin(mutation("https://images.internal.test", SESSION_COOKIE, {
        host: "images.internal.test",
      })),
    ).toBeNull();
  });

  it("rejects a foreign origin, a missing origin and a null origin", () => {
    for (const origin of ["https://evil.example.com", null, "null"]) {
      const response = assertSessionMutationOrigin(mutation(origin));
      expect(response?.status).toBe(403);
    }
  });

  it("ignores safe methods and requests without a session cookie", () => {
    const read = new Request("https://studio.example.com/api/history", {
      method: "GET",
      headers: { host: "studio.example.com", origin: "https://evil.example.com", cookie: SESSION_COOKIE },
    });
    expect(assertSessionMutationOrigin(read)).toBeNull();
    expect(assertSessionMutationOrigin(mutation(null, null))).toBeNull();
  });

  it("leaves API key callers untouched", () => {
    const response = assertSessionMutationOrigin(
      mutation("https://evil.example.com", null, { "x-api-key": "key-123" }),
    );
    expect(response).toBeNull();
  });

  it("rejects credentials embedded in the origin", () => {
    expect(isAllowedRequestOrigin(mutation("https://user:pass@studio.example.com"), null)).toBe(false);
  });
});

