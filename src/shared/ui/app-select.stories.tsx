import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  AppSelectContent,
  AppSelectItem,
  AppSelectRoot,
  AppSelectTrigger,
  AppSelectValue,
} from "@/shared/ui/app-select";

const meta = {
  title: "Project Design/App/AppSelect",
  component: AppSelectPreview,
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppSelectPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

function AppSelectPreview() {
  return (
    <div className="w-[280px]">
      <AppSelectRoot defaultValue="image">
        <AppSelectTrigger>
          <AppSelectValue />
        </AppSelectTrigger>
        <AppSelectContent>
          <AppSelectItem value="image">Image</AppSelectItem>
          <AppSelectItem value="video">Video</AppSelectItem>
          <AppSelectItem value="audio">Audio</AppSelectItem>
        </AppSelectContent>
      </AppSelectRoot>
    </div>
  );
}

export const Default: Story = {};
