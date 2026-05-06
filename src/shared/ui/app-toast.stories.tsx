import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppButton } from "@/shared/ui/app-button";
import { AppToaster, appToast } from "@/shared/ui/app-toast";

type AppToastPreviewProps = {
  message: string;
  type: "copied" | "success" | "error";
};

function AppToastPreview({ message, type }: AppToastPreviewProps) {
  const showToast = () => {
    if (type === "copied") {
      appToast.copied(message);
      return;
    }
    if (type === "success") {
      appToast.success(message);
      return;
    }
    appToast.error(message);
  };

  return (
    <div className="flex items-center gap-3">
      <AppToaster />
      <AppButton type="button" variant="surface" onClick={showToast}>
        Show {type} toast
      </AppButton>
    </div>
  );
}

const meta = {
  title: "Project Design/App/AppToast",
  component: AppToastPreview,
  args: {
    message: "Copied to clipboard.",
    type: "copied",
  },
  argTypes: {
    message: { control: "text" },
    type: { control: "select", options: ["copied", "success", "error"] },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppToastPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: (args) => <AppToastPreview {...args} />,
};
