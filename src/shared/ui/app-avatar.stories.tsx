import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Image as ImageIcon, User } from "lucide-react";
import {
  AppAvatar,
  AppAvatarFallback,
  AppAvatarImage,
} from "@/shared/ui/app-avatar";

type AppAvatarPreviewProps = {
  size: "sm" | "md" | "lg";
  mode: "icon" | "initials" | "image";
  initials: string;
};

const sizeClassNames: Record<AppAvatarPreviewProps["size"], string> = {
  sm: "size-9",
  md: "size-12",
  lg: "size-16",
};

function AppAvatarPreview({ size, mode, initials }: AppAvatarPreviewProps) {
  return (
    <AppAvatar className={sizeClassNames[size]}>
      {mode === "image" ? (
        <AppAvatarImage src="/assets/creative-studio/mirror-portrait.jpg" alt="" />
      ) : null}
      <AppAvatarFallback>
        {mode === "initials" ? (
          initials
        ) : mode === "image" ? (
          <ImageIcon className="h-5 w-5" />
        ) : (
          <User className="h-5 w-5" />
        )}
      </AppAvatarFallback>
    </AppAvatar>
  );
}

const meta = {
  title: "Project Design/App/AppAvatar",
  component: AppAvatarPreview,
  args: {
    size: "md",
    mode: "icon",
    initials: "LS",
  },
  argTypes: {
    size: { control: "select", options: ["sm", "md", "lg"] },
    mode: { control: "select", options: ["icon", "initials", "image"] },
    initials: { control: "text" },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppAvatarPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => <AppAvatarPreview {...args} />,
};
