import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { User } from "lucide-react";
import {
  AppAvatar,
  AppAvatarFallback,
} from "@/shared/ui/app-avatar";

const meta = {
  title: "Project Design/App/AppAvatar",
  component: AppAvatar,
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppAvatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <AppAvatar className="size-12">
      <AppAvatarFallback>
        <User className="h-5 w-5" />
      </AppAvatarFallback>
    </AppAvatar>
  ),
};
