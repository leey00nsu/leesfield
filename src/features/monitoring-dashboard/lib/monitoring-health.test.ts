import { describe, expect, it } from "vitest";
import { resolveErrorRateHealth } from "@/features/monitoring-dashboard/lib/monitoring-health";

describe("resolveErrorRateHealth", () => {
  it("marks a zero error rate as healthy", () => {
    expect(resolveErrorRateHealth(0)).toEqual({
      labelKey: "kpi.health.healthy",
      iconClassName: "text-emerald-300",
      hintClassName: "text-emerald-300",
    });
  });

  it("marks a low non-zero error rate as watch instead of stable", () => {
    expect(resolveErrorRateHealth(0.01)).toEqual({
      labelKey: "kpi.health.watch",
      iconClassName: "text-amber-300",
      hintClassName: "text-amber-300",
    });
  });

  it("marks a high error rate as attention", () => {
    expect(resolveErrorRateHealth(0.08)).toEqual({
      labelKey: "kpi.health.attention",
      iconClassName: "text-destructive",
      hintClassName: "text-destructive",
    });
  });
});
