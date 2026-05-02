import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppExpandableText } from "@/shared/ui/app-expandable-text";

const meta = {
  title: "Project Design/App/AppExpandableText",
  component: AppExpandableText,
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppExpandableText>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children:
      "A long generation prompt with cinematic lighting, layered details, high contrast, refined composition, and production-ready output constraints.",
    collapsedLines: 2,
    showMoreLabel: "Show more",
    showLessLabel: "Show less",
  },
  render: (args) => (
    <div className="w-[420px] rounded-2xl border border-white/10 bg-surface-dark p-5">
      <AppExpandableText {...args} />
    </div>
  ),
};
