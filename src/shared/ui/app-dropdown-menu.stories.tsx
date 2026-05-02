import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from "@/shared/ui/app-dropdown-menu";

const meta = {
  title: "Project Design/App/AppDropdownMenu",
  component: AppDropdownMenu,
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppDropdownMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <AppButton variant="surface">Open menu</AppButton>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent className="border-white/10 bg-background-dark text-white">
        <AppDropdownMenuLabel>Actions</AppDropdownMenuLabel>
        <AppDropdownMenuSeparator className="bg-white/10" />
        <AppDropdownMenuItem>Open</AppDropdownMenuItem>
        <AppDropdownMenuItem>Copy</AppDropdownMenuItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  ),
};
