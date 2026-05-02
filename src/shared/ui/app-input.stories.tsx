import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppInput } from "@/shared/ui/app-input";

const meta = {
  title: "Project Design/App/AppInput",
  component: AppInput,
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    defaultValue: "Leesfield Video",
    "aria-label": "Model name",
  },
  render: (args) => (
    <div className="w-[320px] rounded-2xl border border-white/10 bg-surface-dark p-5">
      <AppInput {...args} />
    </div>
  ),
};
