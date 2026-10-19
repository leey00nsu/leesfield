import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import { config, middleware } from "@/middleware";

describe("request ID middleware", () => {
  it("leaves external request bodies to route readers while retaining UI middleware", () => {
    for (const path of ["/api/external", "/api/external/spaces", "/api/external/generations", "/api/external/assets/uploads/id/content"]) {
      expect(unstable_doesMiddlewareMatch({ config, url: "http://localhost" + path }), path).toBe(false);
    }
    for (const path of ["/spaces", "/api/health/live", "/api/external-other"]) {
      expect(unstable_doesMiddlewareMatch({ config, url: "http://localhost" + path }), path).toBe(true);
    }
  });
  it("preserves a valid request ID and does not set a locale cookie for API routes", () => {
    const response = middleware(
      new NextRequest("http://localhost/api/health/live", {
        headers: { "x-request-id": "edge-123" },
      }),
    );

    expect(response.headers.get("x-request-id")).toBe("edge-123");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("generates a bounded request ID for invalid input", () => {
    const response = middleware(
      new NextRequest("http://localhost/api/health/live", {
        headers: { "x-request-id": "contains spaces" },
      }),
    );
    const requestId = response.headers.get("x-request-id");

    expect(requestId).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/);
  });
});
