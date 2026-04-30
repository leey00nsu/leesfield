import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BrandLogo } from "@/shared/ui/brand-logo";

const meta = {
  title: "Project Design/Brand/BrandLogo",
  component: BrandLogo,
  parameters: {
    layout: "centered",
  },
  args: {
    label: "leesfield",
    variant: "full",
    size: "md",
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
  },
} satisfies Meta<typeof BrandLogo>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {};

export const IconOnly: Story = {
  args: {
    variant: "icon",
    size: "lg",
  },
};
