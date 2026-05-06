import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
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

type AppDialogPreviewProps = {
  defaultOpen: boolean;
  surface: "default" | "media";
  size: "sm" | "md" | "lg" | "xl";
  padding: "default" | "none";
  title: string;
  description: string;
  showFooter: boolean;
};

function AppDialogPreview({
  defaultOpen,
  surface,
  size,
  padding,
  title,
  description,
  showFooter,
}: AppDialogPreviewProps) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  const content = (
    <>
      <AppDialogHeader>
        <div>
          <AppDialogDescription>{description}</AppDialogDescription>
          <AppDialogTitle>{title}</AppDialogTitle>
        </div>
        <AppDialogClose asChild>
          <AppDialogIconButton aria-label="Close">
            <X className="h-4 w-4" />
          </AppDialogIconButton>
        </AppDialogClose>
      </AppDialogHeader>
      <AppFormField className={padding === "none" ? "px-6 pb-6" : undefined}>
        <AppLabel htmlFor="dialog-model-key">Model key</AppLabel>
        <AppInput id="dialog-model-key" defaultValue="leesfield-video" />
      </AppFormField>
      {showFooter ? (
        <AppDialogFooter className={padding === "none" ? "px-6 pb-6" : undefined}>
          <AppDialogCancelButton>Cancel</AppDialogCancelButton>
          <AppDialogActionButton>Save</AppDialogActionButton>
        </AppDialogFooter>
      ) : null}
    </>
  );

  return (
    <AppDialog open={open} onOpenChange={setOpen}>
      <AppButton onClick={() => setOpen(true)}>Open dialog</AppButton>
      <AppDialogContent surface={surface} size={size} padding={padding}>
        {padding === "none" ? <div className="p-6">{content}</div> : content}
      </AppDialogContent>
    </AppDialog>
  );
}

const meta = {
  title: "Project Design/App/AppDialog",
  component: AppDialogPreview,
  args: {
    defaultOpen: true,
    surface: "default",
    size: "md",
    padding: "default",
    title: "Leesfield Video",
    description: "MODEL DETAIL",
    showFooter: true,
  },
  argTypes: {
    defaultOpen: { control: "boolean" },
    surface: { control: "select", options: ["default", "media"] },
    size: { control: "select", options: ["sm", "md", "lg", "xl"] },
    padding: { control: "select", options: ["default", "none"] },
    title: { control: "text" },
    description: { control: "text" },
    showFooter: { control: "boolean" },
  },
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof AppDialogPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => <AppDialogPreview {...args} />,
};

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
