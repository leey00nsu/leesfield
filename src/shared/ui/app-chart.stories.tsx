import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { AppChartContainer } from "@/shared/ui/app-chart";

const meta = {
  title: "Project Design/App/AppChart",
  component: AppChartPreview,
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppChartPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

const data = [
  { day: "Apr 23", value: 18, latency: 1.8 },
  { day: "Apr 24", value: 22, latency: 1.6 },
  { day: "Apr 25", value: 20, latency: 1.4 },
  { day: "Apr 26", value: 28, latency: 1.7 },
  { day: "Apr 27", value: 26, latency: 1.3 },
  { day: "Apr 28", value: 32, latency: 1.2 },
];

const usageData = [
  { name: "Image", value: 60, color: "#d4f032" },
  { name: "Video", value: 25, color: "rgba(255,255,255,0.72)" },
  { name: "Audio", value: 10, color: "rgba(255,255,255,0.28)" },
  { name: "Other", value: 5, color: "rgba(255,255,255,0.14)" },
];

function AppChartPreview() {
  return (
    <AppChartContainer className="w-[360px]" height={160}>
      <LineChart data={data}>
        <Line
          dataKey="value"
          dot={false}
          stroke="rgb(212 240 50)"
          strokeWidth={2}
        />
      </LineChart>
    </AppChartContainer>
  );
}

export const Default: Story = {};

export const AreaWithAxes: Story = {
  render: () => (
    <AppChartContainer className="w-[520px]" height={240}>
      <AreaChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="storybook-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d4f032" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#d4f032" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
        <XAxis
          dataKey="day"
          tick={{ fill: "#9CA3AF", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#9CA3AF", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#d4f032"
          strokeWidth={2}
          fill="url(#storybook-area)"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </AppChartContainer>
  ),
};

export const UsagePie: Story = {
  render: () => (
    <div className="grid w-[420px] grid-cols-[180px_minmax(0,1fr)] items-center gap-5 rounded-[1.25rem] border border-white/10 bg-[#0b0d0e] p-5 text-white">
      <AppChartContainer className="h-[180px] w-[180px] border-0 bg-transparent p-0" height={180}>
        <PieChart>
          <Pie
            data={usageData}
            dataKey="value"
            innerRadius={54}
            outerRadius={78}
            paddingAngle={2}
            stroke="rgba(0,0,0,0.24)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {usageData.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </AppChartContainer>
      <div className="space-y-3 text-sm text-white/62">
        {usageData.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.name}
            </span>
            <span className="font-mono text-white/76">{item.value}%</span>
          </div>
        ))}
      </div>
    </div>
  ),
};
