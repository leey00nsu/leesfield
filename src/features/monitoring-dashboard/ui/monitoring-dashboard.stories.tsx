import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type {
  MonitoringOverview,
  MonitoringRequestItem,
  MonitoringStatsRow,
} from "@/features/monitoring-dashboard/model/types";
import { MonitoringKpiCards } from "@/features/monitoring-dashboard/ui/monitoring-kpi-cards";
import { MonitoringRequestTable } from "@/features/monitoring-dashboard/ui/monitoring-request-table";
import { MonitoringStatsChart } from "@/features/monitoring-dashboard/ui/monitoring-stats-chart";

const stats: MonitoringStatsRow[] = [
  { day: "2026-04-23", total: 92, failed: 2, errorRate: 0.021, avgLatencyMs: 1250, p95LatencyMs: 2100 },
  { day: "2026-04-24", total: 118, failed: 1, errorRate: 0.008, avgLatencyMs: 1180, p95LatencyMs: 1980 },
  { day: "2026-04-25", total: 104, failed: 3, errorRate: 0.028, avgLatencyMs: 1320, p95LatencyMs: 2240 },
  { day: "2026-04-26", total: 136, failed: 2, errorRate: 0.014, avgLatencyMs: 1090, p95LatencyMs: 1840 },
  { day: "2026-04-27", total: 161, failed: 4, errorRate: 0.024, avgLatencyMs: 1210, p95LatencyMs: 2030 },
  { day: "2026-04-28", total: 148, failed: 1, errorRate: 0.006, avgLatencyMs: 990, p95LatencyMs: 1720 },
  { day: "2026-04-29", total: 176, failed: 3, errorRate: 0.017, avgLatencyMs: 1040, p95LatencyMs: 1810 },
];

const overview: MonitoringOverview = {
  activeCount: 18,
  totalCount: 935,
  failedCount: 16,
  errorRate: 0.017,
  avgLatencyMs: 1040,
  p95LatencyMs: 1810,
  usageByType: {
    image: 546,
    video: 241,
    audio: 108,
    other: 40,
  },
};

const requests: MonitoringRequestItem[] = [
  {
    id: "req_001",
    type: "image",
    status: "completed",
    model: "GPT Image 2",
    createdAt: "2026-04-29T12:40:00.000Z",
    durationMs: 18000,
    apiKeyLabel: "Production key",
  },
  {
    id: "req_002",
    type: "video",
    status: "processing",
    model: "Wan 2.2",
    createdAt: "2026-04-29T12:44:00.000Z",
    durationMs: 64000,
    apiKeyLabel: "Production key",
  },
  {
    id: "req_003",
    type: "audio",
    status: "failed",
    model: "Qwen TTS",
    createdAt: "2026-04-29T12:48:00.000Z",
    durationMs: 9200,
    apiKeyLabel: "Staging key",
  },
];

function MonitoringPreview() {
  return (
    <div className="grid gap-4">
      <MonitoringKpiCards data={overview} stats={stats} isLoading={false} />
      <MonitoringStatsChart data={stats} isLoading={false} />
      <MonitoringRequestTable
        items={requests}
        total={requests.length}
        limit={20}
        offset={0}
        onLimitChange={() => {}}
        onOffsetChange={() => {}}
        isLoading={false}
        error={null}
        updatedAt="2026-04-29T12:50:00.000Z"
        timeZone="Asia/Seoul"
      />
    </div>
  );
}

const meta = {
  title: "Project Design/Monitoring/Dashboard",
  component: MonitoringPreview,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MonitoringPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  render: () => (
    <div className="grid gap-4">
      <MonitoringKpiCards data={null} stats={[]} isLoading />
      <MonitoringStatsChart data={[]} isLoading />
      <MonitoringRequestTable
        items={[]}
        total={0}
        limit={20}
        offset={0}
        onLimitChange={() => {}}
        onOffsetChange={() => {}}
        isLoading
        error={null}
        updatedAt={null}
        timeZone="Asia/Seoul"
      />
    </div>
  ),
};
