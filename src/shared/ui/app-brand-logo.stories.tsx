import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppBrandLogo } from "@/shared/ui/app-brand-logo";

const meta = {
  title: "Project Design/App/AppBrandLogo",
  component: AppBrandLogo,
  args: {
    label: "leesfield",
    variant: "full",
    size: "md",
    priority: true,
  },
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["full", "icon"],
    },
    size: {
      control: "inline-radio",
      options: ["sm", "md", "lg"],
    },
    label: { control: "text" },
    priority: { control: "boolean" },
  },
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

export const Playground: Story = {};

export const Wordmark: Story = {
  args: {
    label: "leesfield",
    variant: "full",
    priority: true,
  },
};

export const IconOnly: Story = {
  args: {
    variant: "icon",
    size: "lg",
  },
};
