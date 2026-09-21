import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "@/middleware";

describe("request ID middleware", () => {
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
