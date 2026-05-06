import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Copy, Download, Trash2 } from "lucide-react";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from "@/shared/ui/app-dropdown-menu";

type AppDropdownMenuPreviewProps = {
  label: string;
  align: "start" | "center" | "end";
  showDanger: boolean;
};

function AppDropdownMenuPreview({
  label,
  align,
  showDanger,
}: AppDropdownMenuPreviewProps) {
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <AppButton variant="surface">{label}</AppButton>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent
        align={align}
        className="border-white/10 bg-background-dark text-white"
      >
        <AppDropdownMenuLabel>Actions</AppDropdownMenuLabel>
        <AppDropdownMenuSeparator className="bg-white/10" />
        <AppDropdownMenuItem className="gap-2">
          <Download className="h-4 w-4" />
          Download
        </AppDropdownMenuItem>
        <AppDropdownMenuItem className="gap-2">
          <Copy className="h-4 w-4" />
          Copy
        </AppDropdownMenuItem>
        {showDanger ? (
          <AppDropdownMenuItem className="gap-2 text-red-200">
            <Trash2 className="h-4 w-4" />
            Delete
          </AppDropdownMenuItem>
        ) : null}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

const meta = {
  title: "Project Design/App/AppDropdownMenu",
  component: AppDropdownMenuPreview,
  args: {
    label: "Open menu",
    align: "center",
    showDanger: false,
  },
  argTypes: {
    label: { control: "text" },
    align: { control: "select", options: ["start", "center", "end"] },
    showDanger: { control: "boolean" },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppDropdownMenuPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => <AppDropdownMenuPreview {...args} />,
};
