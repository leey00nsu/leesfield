import type { ReactNode } from "react";
import { Activity, BarChart3, CheckCircle2, Timer } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Label,
  Pie,
  PieChart,
} from "recharts";
import { useTranslations } from "next-intl";
import type {
  MonitoringOverview,
  MonitoringStatsRow,
} from "@/features/monitoring-dashboard/model/types";
import { formatCompactNumber, formatDuration, formatPercent } from "@/features/monitoring-dashboard/lib/format";
import { AppCard } from "@/shared/ui/app-card";
import { AppChartContainer } from "@/shared/ui/app-chart";

interface MonitoringKpiCardsProps {
  data: MonitoringOverview | null;
  stats?: MonitoringStatsRow[];
  isLoading: boolean;
}

const cardTitle = "text-sm font-semibold text-white/70";
const cardValue = "font-serif text-[2.65rem] font-normal leading-none text-white";

function SparklineChart({
  values,
  variant = "line",
}: {
  values: number[];
  variant?: "line" | "bars";
}) {
  const normalized = (values.length > 0 ? values : [0, 0, 0, 0, 0, 0, 0, 0])
    .slice(-24)
    .map((value, index) => ({
      index,
      value: Math.max(0, Number.isFinite(value) ? value : 0),
    }));

  if (variant === "bars") {
    return (
      <AppChartContainer className="border-0 bg-transparent p-0" height={54}>
        <BarChart data={normalized} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
          <Bar
            dataKey="value"
            fill="#d4f032"
            radius={[4, 4, 0, 0]}
            barSize={4}
            isAnimationActive={false}
          />
        </BarChart>
      </AppChartContainer>
    );
  }

  return (
    <AppChartContainer className="border-0 bg-transparent p-0" height={54}>
      <AreaChart data={normalized} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
        <Area
          type="monotone"
          dataKey="value"
          stroke="#d4f032"
          strokeWidth={2}
          fill="#d4f032"
          fillOpacity={0.06}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </AppChartContainer>
  );
}

function DonutChart({ value, label }: { value: number; label: string }) {
  const safeValue = Math.max(0, Math.min(100, value));
  const data = [
    { name: "value", value: safeValue },
    { name: "remaining", value: Math.max(0, 100 - safeValue) },
  ];
  return (
    <AppChartContainer className="h-24 w-24 border-0 bg-transparent p-0" height={96}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          innerRadius={30}
          outerRadius={44}
          startAngle={90}
          endAngle={-270}
          stroke="rgba(0,0,0,0.22)"
          strokeWidth={2}
          isAnimationActive={false}
        >
          <Cell fill="#d4f032" />
          <Cell fill="rgba(255,255,255,0.12)" />
          <Label
            value={label}
            position="center"
            fill="#fff"
            fontSize={13}
            fontWeight={600}
          />
        </Pie>
      </PieChart>
    </AppChartContainer>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  visual,
}: {
  title: string;
  value: string;
  icon: typeof Activity;
  visual?: ReactNode;
}) {
  return (
    <AppCard
      variant="editorial-flat"
      radius="lg"
      padding="lg"
      className="relative min-h-[11.5rem]"
    >
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-white/52" />
        <span className={cardTitle}>{title}</span>
      </div>
      <div className="mt-6 flex items-end gap-3">
        <span className={cardValue}>{value}</span>
      </div>
      <div className="mt-4">{visual}</div>
      <div className="pointer-events-none absolute inset-x-6 bottom-5 h-px bg-white/8" />
    </AppCard>
  );
}

function UsageCard({
  title,
  value,
  percent,
}: {
  title: string;
  value: string;
  percent: number;
}) {
  return (
    <AppCard
      variant="editorial-flat"
      radius="lg"
      padding="lg"
      className="relative min-h-[11.5rem]"
    >
      <div className="flex items-center gap-3">
        <BarChart3 className="h-5 w-5 text-white/52" />
        <span className={cardTitle}>{title}</span>
      </div>
      <div className="mt-5 flex items-center gap-7">
        <DonutChart value={percent} label={`${Math.round(percent)}%`} />
        <div>
          <div className={cardValue}>{value}</div>
        </div>
      </div>
    </AppCard>
  );
}

export function MonitoringKpiCards({
  data,
  stats = [],
  isLoading,
}: MonitoringKpiCardsProps) {
  const t = useTranslations("monitoringDashboard");

  const activeCount = data ? formatCompactNumber(data.activeCount) : "-";
  const totalCount = data ? formatCompactNumber(data.totalCount) : "-";
  const avgLatency = data ? formatDuration(data.avgLatencyMs) : "-";
  const successRateValue = data ? Math.max(0, 1 - data.errorRate) : 0;
  const successRate = data ? formatPercent(successRateValue) : "-";
  const totalValues = stats.map((item) => item.total);
  const latencyValues = stats.map((item) => item.avgLatencyMs ?? 0);
  const successPercent = successRateValue * 100;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title={t("kpi.successRate")}
        value={isLoading ? "..." : successRate}
        icon={CheckCircle2}
        visual={<SparklineChart values={stats.map((item) => 1 - item.errorRate)} />}
      />
      <StatCard
        title={t("kpi.active")}
        value={isLoading ? "..." : activeCount}
        icon={BarChart3}
        visual={<SparklineChart values={totalValues} variant="bars" />}
      />
      <StatCard
        title={t("kpi.avgLatency")}
        value={isLoading ? "..." : avgLatency}
        icon={Timer}
        visual={<SparklineChart values={latencyValues} />}
      />
      <UsageCard
        title={t("kpi.total")}
        value={isLoading ? "..." : totalCount}
        percent={successPercent}
      />
    </div>
  );
}
