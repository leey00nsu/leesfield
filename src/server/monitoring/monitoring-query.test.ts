import { describe, expect, it } from "vitest";
import { parseMonitoringQuery } from "@/server/monitoring/monitoring-query";

describe("parseMonitoringQuery", () => {
  it("offset이 음수면 0으로 보정한다", () => {
    const params = new URLSearchParams(
      "from=2026-01-01&to=2026-01-02&offset=-10",
    );

    const query = parseMonitoringQuery(params, {
      defaultLimit: 50,
      defaultOffset: 0,
    });

    expect(query.offset).toBe(0);
  });

  it("offset이 과도하면 상한으로 제한한다", () => {
    const params = new URLSearchParams(
      "from=2026-01-01&to=2026-01-02&offset=9999999",
    );

    const query = parseMonitoringQuery(params, {
      defaultLimit: 50,
      defaultOffset: 0,
    });

    expect(query.offset).toBe(10_000);
  });

  it("offset이 숫자가 아니면 기본값을 사용한다", () => {
    const params = new URLSearchParams(
      "from=2026-01-01&to=2026-01-02&offset=invalid",
    );

    const query = parseMonitoringQuery(params, {
      defaultLimit: 50,
      defaultOffset: 123,
    });

    expect(query.offset).toBe(123);
  });
});
