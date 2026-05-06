export type MonitoringHealthDescriptor = {
  labelKey:
    | "kpi.health.healthy"
    | "kpi.health.watch"
    | "kpi.health.attention";
  iconClassName: string;
  hintClassName: string;
};

export function resolveErrorRateHealth(
  errorRate: number,
): MonitoringHealthDescriptor {
  if (errorRate <= 0) {
    return {
      labelKey: "kpi.health.healthy",
      iconClassName: "text-emerald-300",
      hintClassName: "text-emerald-300",
    };
  }

  if (errorRate < 0.05) {
    return {
      labelKey: "kpi.health.watch",
      iconClassName: "text-amber-300",
      hintClassName: "text-amber-300",
    };
  }

  return {
    labelKey: "kpi.health.attention",
    iconClassName: "text-destructive",
    hintClassName: "text-destructive",
  };
}
