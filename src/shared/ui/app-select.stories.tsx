import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useState } from "react";
import {
  AppSelectContent,
  AppSelectItem,
  AppSelectRoot,
  AppSelectTrigger,
  AppSelectValue,
} from "@/shared/ui/app-select";

type AppSelectPreviewProps = {
  value: "image" | "video" | "audio";
  surface: "default" | "toolbar";
  triggerSize: "sm" | "md";
  disabled: boolean;
};

function AppSelectPreview({
  value,
  surface,
  triggerSize,
  disabled,
}: AppSelectPreviewProps) {
  const [selectedValue, setSelectedValue] = useState<string>(value);

  useEffect(() => {
    setSelectedValue(value);
  }, [value]);

  return (
    <div className="w-[280px]">
      <AppSelectRoot value={selectedValue} onValueChange={setSelectedValue}>
        <AppSelectTrigger
          surface={surface}
          triggerSize={triggerSize}
          disabled={disabled}
        >
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

const meta = {
  title: "Project Design/App/AppSelect",
  component: AppSelectPreview,
  args: {
    value: "image",
    surface: "default",
    triggerSize: "md",
    disabled: false,
  },
  argTypes: {
    value: { control: "select", options: ["image", "video", "audio"] },
    surface: { control: "select", options: ["default", "toolbar"] },
    triggerSize: { control: "select", options: ["sm", "md"] },
    disabled: { control: "boolean" },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppSelectPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Surfaces: Story = {
  render: () => (
    <div className="grid w-[280px] gap-3">
      <AppSelectPreview
        value="image"
        surface="default"
        triggerSize="md"
        disabled={false}
      />
      <AppSelectPreview
        value="video"
        surface="toolbar"
        triggerSize="md"
        disabled={false}
      />
      <AppSelectPreview
        value="audio"
        surface="default"
        triggerSize="sm"
        disabled={false}
      />
    </div>
  ),
};
