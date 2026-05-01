import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
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

const meta = {
  title: "Project Design/App/AppConfirmDialog",
  component: AppConfirmDialogContent,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof AppConfirmDialogContent>;

export default meta;

type Story = StoryObj<typeof meta>;

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
