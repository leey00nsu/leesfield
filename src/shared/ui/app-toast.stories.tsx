import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppButton } from "@/shared/ui/app-button";
import { AppToaster, appToast } from "@/shared/ui/app-toast";

const meta = {
  title: "Project Design/App/AppToast",
  component: AppToaster,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppToaster>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <AppToaster />
      <AppButton
        type="button"
        variant="surface"
        onClick={() => appToast.copied("Copied to clipboard.")}
      >
        Show copy toast
      </AppButton>
    </div>
  ),
};
