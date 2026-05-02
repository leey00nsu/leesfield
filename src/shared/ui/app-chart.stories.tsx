import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Line, LineChart } from "recharts";
import { AppChartContainer } from "@/shared/ui/app-chart";

const meta = {
  title: "Project Design/App/AppChart",
  component: AppChartPreview,
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppChartPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

const data = [
  { value: 18 },
  { value: 22 },
  { value: 20 },
  { value: 28 },
  { value: 26 },
  { value: 32 },
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
