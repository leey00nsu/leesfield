import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { X } from "lucide-react";
import { useState } from "react";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "@/shared/ui/app-dialog";
import { AppInput } from "@/shared/ui/app-input";
import { AppFormField, AppLabel } from "@/shared/ui/app-form-control";

const meta = {
  title: "Project Design/App/AppDialog",
  component: AppDialogContent,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof AppDialogContent>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ModelDialog: Story = {
  render: function ModelDialogStory() {
    const [open, setOpen] = useState(true);

    return (
      <AppDialog open={open} onOpenChange={setOpen}>
        <AppButton onClick={() => setOpen(true)}>Open dialog</AppButton>
        <AppDialogContent>
          <AppDialogHeader>
            <div>
              <AppDialogDescription>MODEL DETAIL</AppDialogDescription>
              <AppDialogTitle>Leesfield Video</AppDialogTitle>
            </div>
            <AppDialogClose asChild>
              <AppButton variant="surface" size="icon-sm" aria-label="Close">
                <X className="h-4 w-4" />
              </AppButton>
            </AppDialogClose>
          </AppDialogHeader>
          <AppFormField>
            <AppLabel htmlFor="dialog-model-key">Model key</AppLabel>
            <AppInput id="dialog-model-key" defaultValue="leesfield-video" />
          </AppFormField>
          <AppDialogFooter>
            <AppButton variant="surface">Cancel</AppButton>
            <AppButton>Save</AppButton>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    );
  },
};
