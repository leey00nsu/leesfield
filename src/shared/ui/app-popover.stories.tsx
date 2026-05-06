import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppPopover,
  AppPopoverContent,
  AppPopoverTrigger,
} from "@/shared/ui/app-popover";

type AppPopoverPreviewProps = {
  label: string;
  side: "top" | "right" | "bottom" | "left";
  align: "start" | "center" | "end";
};

function AppPopoverPreview({ label, side, align }: AppPopoverPreviewProps) {
  return (
    <AppPopover>
      <AppPopoverTrigger asChild>
        <AppButton variant="surface">{label}</AppButton>
      </AppPopoverTrigger>
      <AppPopoverContent
        side={side}
        align={align}
        className="border-white/10 bg-background-dark text-white"
      >
        <p className="text-sm text-white/70">Project-styled popover surface.</p>
      </AppPopoverContent>
    </AppPopover>
  );
}

const meta = {
  title: "Project Design/App/AppPopover",
  component: AppPopoverPreview,
  args: {
    label: "Settings",
    side: "bottom",
    align: "center",
  },
  argTypes: {
    label: { control: "text" },
    side: { control: "select", options: ["top", "right", "bottom", "left"] },
    align: { control: "select", options: ["start", "center", "end"] },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppPopoverPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => <AppPopoverPreview {...args} />,
};
