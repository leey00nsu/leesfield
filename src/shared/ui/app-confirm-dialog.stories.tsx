import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useState } from "react";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppConfirmDialog,
  AppConfirmDialogAction,
  AppConfirmDialogCancel,
  AppConfirmDialogContent,
  AppConfirmDialogDescription,
  AppConfirmDialogFooter,
  AppConfirmDialogHeader,
  AppConfirmDialogTitle,
} from "@/shared/ui/app-confirm-dialog";

type AppConfirmDialogPreviewProps = {
  defaultOpen: boolean;
  title: string;
  description: string;
  actionLabel: string;
  destructive: boolean;
};

function AppConfirmDialogPreview({
  defaultOpen,
  title,
  description,
  actionLabel,
  destructive,
}: AppConfirmDialogPreviewProps) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  return (
    <AppConfirmDialog open={open} onOpenChange={setOpen}>
      <AppButton
        variant={destructive ? "danger" : "surface"}
        onClick={() => setOpen(true)}
      >
        Open confirm
      </AppButton>
      <AppConfirmDialogContent>
        <AppConfirmDialogHeader>
          <AppConfirmDialogTitle>{title}</AppConfirmDialogTitle>
          <AppConfirmDialogDescription>
            {description}
          </AppConfirmDialogDescription>
        </AppConfirmDialogHeader>
        <AppConfirmDialogFooter>
          <AppConfirmDialogCancel>Cancel</AppConfirmDialogCancel>
          <AppConfirmDialogAction>{actionLabel}</AppConfirmDialogAction>
        </AppConfirmDialogFooter>
      </AppConfirmDialogContent>
    </AppConfirmDialog>
  );
}

const meta = {
  title: "Project Design/App/AppConfirmDialog",
  component: AppConfirmDialogPreview,
  args: {
    defaultOpen: true,
    title: "Delete model?",
    description: "This removes the model from the runtime catalog.",
    actionLabel: "Delete",
    destructive: true,
  },
  argTypes: {
    defaultOpen: { control: "boolean" },
    title: { control: "text" },
    description: { control: "text" },
    actionLabel: { control: "text" },
    destructive: { control: "boolean" },
  },
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof AppConfirmDialogPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => <AppConfirmDialogPreview {...args} />,
};

export const DeleteModel: Story = {
  render: function DeleteModelStory() {
    const [open, setOpen] = useState(true);

    return (
      <AppConfirmDialog open={open} onOpenChange={setOpen}>
        <AppButton variant="danger" onClick={() => setOpen(true)}>
          Delete model
        </AppButton>
        <AppConfirmDialogContent>
          <AppConfirmDialogHeader>
            <AppConfirmDialogTitle>Delete model?</AppConfirmDialogTitle>
            <AppConfirmDialogDescription>
              This removes the model from the runtime catalog.
            </AppConfirmDialogDescription>
          </AppConfirmDialogHeader>
          <AppConfirmDialogFooter>
            <AppConfirmDialogCancel>Cancel</AppConfirmDialogCancel>
            <AppConfirmDialogAction>Delete</AppConfirmDialogAction>
          </AppConfirmDialogFooter>
        </AppConfirmDialogContent>
      </AppConfirmDialog>
    );
  },
};
