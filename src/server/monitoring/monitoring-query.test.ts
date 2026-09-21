import { describe, expect, it } from "vitest";
import {
  MAX_MONITORING_RANGE_DAYS,
  MAX_MONITORING_OFFSET,
  MAX_MONITORING_SEARCH_LENGTH,
  parseMonitoringQuery,
} from "@/server/monitoring/monitoring-query";

describe("parseMonitoringQuery", () => {
  it("audio 타입을 허용한다", () => {
    const params = new URLSearchParams(
      "from=2026-01-01&to=2026-01-02&type=audio",
    );

    const query = parseMonitoringQuery(params);

    expect(query.type).toBe("audio");
  });

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

    expect(query.offset).toBe(MAX_MONITORING_OFFSET);
  });

  it("날짜 범위와 검색어 길이, count 요청을 제한한다", () => {
    const query = parseMonitoringQuery(new URLSearchParams({
      from: "2020-01-01T00:00:00Z",
      to: "2026-01-01T00:00:00Z",
      query: "x".repeat(MAX_MONITORING_SEARCH_LENGTH + 50),
      includeTotal: "false",
    }));

    expect(query.to.getTime() - query.from.getTime()).toBe(
      MAX_MONITORING_RANGE_DAYS * 24 * 60 * 60 * 1_000,
    );
    expect(query.query).toHaveLength(MAX_MONITORING_SEARCH_LENGTH);
    expect(query.includeTotal).toBe(false);
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
