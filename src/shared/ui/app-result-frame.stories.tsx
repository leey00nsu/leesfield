import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppResultFrame } from "@/shared/ui/app-result-frame";

const meta = {
  title: "Project Design/App/AppResultFrame",
  component: AppResultFrame,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppResultFrame>;

export default meta;

type Story = StoryObj<typeof meta>;

export const EmptyFrame: Story = {
  args: {
    className: "grid min-h-80 place-items-center rounded-[1.75rem]",
    children: (
      <div className="text-center">
        <p className="font-semibold text-white">Generated result</p>
        <p className="mt-2 text-sm text-white/52">Appears below the studio intro.</p>
      </div>
    ),
  },
};
