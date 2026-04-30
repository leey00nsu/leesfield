import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Download, Sparkles } from "lucide-react";
import { AppButton } from "@/shared/ui/app-button";

const meta = {
  title: "Project Design/App/AppButton",
  component: AppButton,
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
