import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Download, Sparkles } from "lucide-react";
import { AppButton } from "@/shared/ui/app-button";

const meta = {
  title: "Project Design/App/AppButton",
  component: AppButton,
  args: {
    children: "Generate",
    variant: "primary",
    size: "md",
    disabled: false,
  },
  argTypes: {
    variant: {
      control: "select",
      options: [
        "primary",
        "surface",
        "surface-muted",
        "auth",
        "ghost",
        "white",
        "danger",
        "tab",
      ],
    },
    size: {
      control: "select",
      options: [
        "sm",
        "md",
        "lg",
        "xl",
        "pill-sm",
        "pill-md",
        "toolbar",
        "icon-sm",
        "icon",
      ],
    },
    disabled: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <AppButton {...args}>
      {args.children}
      <Sparkles className="h-4 w-4" />
    </AppButton>
  ),
};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <AppButton>
        Generate
        <Sparkles className="h-4 w-4" />
      </AppButton>
      <AppButton variant="surface">Surface</AppButton>
      <AppButton variant="ghost">Ghost</AppButton>
      <AppButton variant="white">White</AppButton>
      <AppButton variant="danger">Danger</AppButton>
      <AppButton variant="surface" size="icon" aria-label="Download">
        <Download className="h-4 w-4" />
      </AppButton>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <AppButton size="sm">Small</AppButton>
      <AppButton size="md">Medium</AppButton>
      <AppButton size="lg">Large</AppButton>
      <AppButton size="xl">Hero action</AppButton>
      <AppButton size="toolbar">Toolbar</AppButton>
      <AppButton size="icon-sm" variant="surface" aria-label="Download">
        <Download className="h-4 w-4" />
      </AppButton>
      <AppButton size="icon" variant="surface" aria-label="Generate">
        <Sparkles className="h-4 w-4" />
      </AppButton>
    </div>
  ),
};
