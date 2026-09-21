// @vitest-environment node

import { describe, expect, it } from "vitest";

import { resolveClientIp, resolveClientSubject } from "./client-ip";

function requestWith(headerValue?: string): Request {
  const headers: Record<string, string> = {};
  if (headerValue !== undefined) headers["x-forwarded-for"] = headerValue;
  return new Request("https://studio.example.com/api/generation", {
    method: "POST",
    headers,
  });
}

const TRUSTED = { trustProxyHeaders: true, trustedProxyHops: 1 };
const UNTRUSTED = { trustProxyHeaders: false, trustedProxyHops: 1 };

describe("resolveClientIp", () => {
  it("ignores forwarded headers unless the deployment trusts a proxy", () => {
    expect(resolveClientIp(requestWith("203.0.113.9"), UNTRUSTED)).toBeNull();
    expect(resolveClientSubject(requestWith("203.0.113.9"), UNTRUSTED)).toBe(
      "unknown",
    );
    expect(resolveClientIp(requestWith(), TRUSTED)).toBeNull();
  });

  it("uses the hop written by our own proxy", () => {
    expect(
      resolveClientIp(requestWith("198.51.100.7, 203.0.113.9"), TRUSTED),
    ).toBe("203.0.113.9");
    expect(
      resolveClientIp(requestWith("198.51.100.7, 10.0.0.1, 203.0.113.9"), {
        trustProxyHeaders: true,
        trustedProxyHops: 2,
      }),
    ).toBe("10.0.0.1");
  });

  it("rejects spoofed or malformed values and short chains", () => {
    expect(resolveClientIp(requestWith("not-an-ip"), TRUSTED)).toBeNull();
    expect(resolveClientIp(requestWith(""), TRUSTED)).toBeNull();
    expect(
      resolveClientIp(requestWith("203.0.113.9"), {
        trustProxyHeaders: true,
        trustedProxyHops: 3,
      }),
    ).toBeNull();
  });

  it("accepts bracketed IPv6 addresses", () => {
    expect(resolveClientIp(requestWith("[2001:db8::1]"), TRUSTED)).toBe(
      "2001:db8::1",
    );
  });
});

