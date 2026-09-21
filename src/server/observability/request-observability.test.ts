import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getRequestContext,
  logStructured,
  measureDatabase,
  measureProvider,
  withRequestObservability,
} from "@/server/observability/request-observability";
import {
  getObservabilitySnapshot,
  resetObservabilityMetrics,
} from "@/server/observability/metrics";

describe("request observability", () => {
  beforeEach(() => {
    resetObservabilityMetrics();
    vi.restoreAllMocks();
  });

  it("propagates a bounded request ID and records completion context", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const handler = withRequestObservability(
      "/api/test",
      async (request: Request) => {
        expect(getRequestContext()).toMatchObject({
          requestId: "req-123",
          route: "/api/test",
          method: "GET",
        });
        expect(request.url).toContain("/api/test");
        return new Response(JSON.stringify({ ok: true }), { status: 201 });
      },
    );

    const response = await handler(
      new Request("http://localhost/api/test", {
        headers: { "x-request-id": "req-123" },
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe("req-123");
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"event":"http.request"'));
    expect(getObservabilitySnapshot().http).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          route: "GET /api/test",
          count: 1,
          statuses: expect.objectContaining({ "2xx": 1 }),
        }),
      ]),
    );
  });

  it("records provider and database failures without logging their values", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(measureDatabase("test.query", async () => {
      throw new Error("database-secret");
    })).rejects.toThrow("database-secret");
    await expect(measureProvider("modal", async () => {
      throw new Error("provider-secret");
    })).rejects.toThrow("provider-secret");

    const snapshot = getObservabilitySnapshot();
    expect(snapshot.database[0]).toMatchObject({ operation: "test.query", errors: 1 });
    expect(snapshot.providers[0]).toMatchObject({ provider: "modal", errors: 1 });
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("redacts unbounded structured field values", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logStructured("test.event", {
      kind: "prompt text with spaces and a secret",
      route: "https://internal.example/secret",
    });

    const line = String(log.mock.calls[0]?.[0]);
    expect(line).not.toContain("secret");
    expect(line).toContain('"kind":"redacted"');
    expect(line).toContain('"route":"unknown"');
  });

  it("records thrown route errors as 5xx and keeps the request ID bounded", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = withRequestObservability(
      "/api/failing",
      async (request: Request) => {
        expect(request).toBeInstanceOf(Request);
        throw new Error("secret-error");
      },
    );

    await expect(
      handler(new Request("http://localhost/api/failing", {
        headers: { "x-request-id": "contains spaces and is rejected" },
      })),
    ).rejects.toThrow("secret-error");

    const snapshot = getObservabilitySnapshot();
    expect(snapshot.http).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          route: "GET /api/failing",
          errors: 1,
          statuses: expect.objectContaining({ "5xx": 1 }),
        }),
      ]),
    );
    const line = String(errorLog.mock.calls[0]?.[0]);
    expect(line).not.toContain("secret-error");
    expect(line).toMatch(/"requestId":"[A-Za-z0-9][A-Za-z0-9._:-]{0,95}"/);
  });
});
