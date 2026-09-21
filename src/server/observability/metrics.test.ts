import { beforeEach, describe, expect, it } from "vitest";

import {
  getObservabilitySnapshot,
  recordDatabaseQuery,
  recordHttpRequest,
  recordProviderRequest,
  recordQueueSnapshot,
  recordWorkerFailure,
  resetObservabilityMetrics,
} from "@/server/observability/metrics";

describe("observability metrics", () => {
  beforeEach(() => {
    resetObservabilityMetrics();
  });

  it("keeps HTTP route cardinality bounded and counts error statuses", () => {
    for (let index = 0; index < 80; index += 1) {
      recordHttpRequest({
        method: "GET",
        route: `/api/items/${index}`,
        status: index === 0 ? 429 : 200,
        durationMs: index + 1,
      });
    }
    recordHttpRequest({
      method: "POST",
      route: "/api/users/alice@example.com?prompt=secret",
      status: 500,
      durationMs: 10,
    });

    const snapshot = getObservabilitySnapshot();
    expect(snapshot.http).toHaveLength(64);
    expect(snapshot.http.find((metric) => metric.route === "GET /api/items/0")).toMatchObject({
      count: 1,
      errors: 1,
      averageDurationMs: 1,
      statuses: { "2xx": 0, "4xx": 1, "5xx": 0 },
    });
    expect(JSON.stringify(snapshot)).not.toContain("alice@example.com");
    expect(JSON.stringify(snapshot)).not.toContain("secret");
  });

  it("records database/provider durations, queue state, and worker failures", () => {
    recordDatabaseQuery({ operation: "health.readiness", durationMs: 12, success: true });
    recordDatabaseQuery({ operation: "health.readiness", durationMs: 20, success: false });
    recordProviderRequest({ provider: "hf_space", status: 200, durationMs: 33 });
    recordProviderRequest({ provider: "hf_space", status: "error", durationMs: 44 });
    recordQueueSnapshot({
      pending: 4,
      processing: 2,
      oldestPendingAgeSeconds: 91,
      failedCleanup: 3,
    });
    recordWorkerFailure("media-cleanup.pass");

    const snapshot = getObservabilitySnapshot({
      total: 10,
      idle: 3,
      active: 7,
      waiting: 2,
    });
    expect(snapshot.database[0]).toMatchObject({
      operation: "health.readiness",
      count: 2,
      errors: 1,
      averageDurationMs: 16,
    });
    expect(snapshot.providers[0]).toMatchObject({
      provider: "hf_space",
      count: 2,
      errors: 1,
      averageDurationMs: 39,
    });
    expect(snapshot.queue).toEqual({
      pending: 4,
      processing: 2,
      oldestPendingAgeSeconds: 91,
      failedCleanup: 3,
    });
    expect(snapshot.databasePool).toEqual({
      total: 10,
      idle: 3,
      active: 7,
      waiting: 2,
    });
    expect(snapshot.workerFailures).toEqual({ "media-cleanup.pass": 1 });
  });
});
