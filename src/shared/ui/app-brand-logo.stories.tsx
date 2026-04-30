import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppBrandLogo } from "@/shared/ui/app-brand-logo";

const meta = {
  title: "Project Design/App/AppBrandLogo",
  component: AppBrandLogo,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppBrandLogo>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Wordmark: Story = {
  args: {
    label: "leesfield",
    priority: true,
  },
};
