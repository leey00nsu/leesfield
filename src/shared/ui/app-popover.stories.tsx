import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppPopover,
  AppPopoverContent,
  AppPopoverTrigger,
} from "@/shared/ui/app-popover";

const meta = {
  title: "Project Design/App/AppPopover",
  component: AppPopover,
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppPopover>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <AppPopover>
      <AppPopoverTrigger asChild>
        <AppButton variant="surface">Settings</AppButton>
      </AppPopoverTrigger>
      <AppPopoverContent className="border-white/10 bg-background-dark text-white">
        <p className="text-sm text-white/70">Project-styled popover surface.</p>
      </AppPopoverContent>
    </AppPopover>
  ),
};
