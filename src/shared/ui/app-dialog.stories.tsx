import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { X } from "lucide-react";
import { useState } from "react";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppDialog,
  AppDialogActionButton,
  AppDialogCancelButton,
  AppDialogClose,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogIconButton,
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
              <AppDialogIconButton aria-label="Close">
                <X className="h-4 w-4" />
              </AppDialogIconButton>
            </AppDialogClose>
          </AppDialogHeader>
          <AppFormField>
            <AppLabel htmlFor="dialog-model-key">Model key</AppLabel>
            <AppInput id="dialog-model-key" defaultValue="leesfield-video" />
          </AppFormField>
          <AppDialogFooter>
            <AppDialogCancelButton>Cancel</AppDialogCancelButton>
            <AppDialogActionButton>Save</AppDialogActionButton>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    );
  },
};

export const MediaDialog: Story = {
  render: function MediaDialogStory() {
    const [open, setOpen] = useState(true);

    return (
      <AppDialog open={open} onOpenChange={setOpen}>
        <AppButton onClick={() => setOpen(true)}>Open media dialog</AppButton>
        <AppDialogContent surface="media" padding="none">
          <div className="grid min-h-80 sm:grid-cols-[1fr_18rem]">
            <div className="flex flex-col justify-center p-8">
              <AppDialogHeader>
                <div>
                  <AppDialogDescription>AUTH GATE</AppDialogDescription>
                  <AppDialogTitle>Continue with leesfield</AppDialogTitle>
                </div>
              </AppDialogHeader>
              <AppDialogFooter className="justify-start">
                <AppDialogCancelButton>Cancel</AppDialogCancelButton>
                <AppDialogActionButton>Sign in</AppDialogActionButton>
              </AppDialogFooter>
            </div>
            <div className="hidden border-l border-white/10 bg-primary/10 sm:block" />
          </div>
        </AppDialogContent>
      </AppDialog>
    );
  },
};
