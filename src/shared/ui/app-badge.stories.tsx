import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppBadge } from "@/shared/ui/app-badge";

const meta = {
  title: "Project Design/App/AppBadge",
  component: AppBadge,
  args: {
    children: "Default",
    variant: "default",
    size: "sm",
  },
  argTypes: {
    children: { control: "text" },
    variant: {
      control: "select",
      options: ["default", "primary", "muted", "outline", "overlay"],
    },
    size: {
      control: "select",
      options: ["sm", "md"],
    },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => <AppBadge {...args} />,
};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <AppBadge variant="default">Default</AppBadge>
      <AppBadge variant="primary">Primary</AppBadge>
      <AppBadge variant="muted">Muted</AppBadge>
      <AppBadge variant="outline">Outline</AppBadge>
      <AppBadge variant="overlay">Overlay</AppBadge>
    </div>
  ),
};
