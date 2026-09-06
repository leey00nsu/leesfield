import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./button/button";
import { Input } from "./input/input";
import { StatusNotice } from "./status-notice/status-notice";
const meta = {
  title: "Brand/Copy Singer parity",
  component: Button,
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;
export const States: Story = {
  render: () => (
    <div className="grid max-w-xl gap-6 p-8">
      <div className="flex gap-3">
        <Button>Primary</Button>
        <Button variant="outline">Outline</Button>
        <Button disabled>Disabled</Button>
      </div>
      <Input aria-label="Input" placeholder="Pretendard input" />
      <Input aria-label="Invalid input" aria-invalid defaultValue="Invalid" />
      <StatusNotice title="작업 대기" description="실행 상태를 확인하세요." />
      <StatusNotice
        tone="destructive"
        title="실행 실패"
        description="입력을 확인하고 다시 시도하세요."
      />
    </div>
  ),
};

import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import {
  AppDialog,
  AppDialogContent,
  AppDialogTitle,
  AppDialogDescription,
} from "@/shared/ui/app-dialog";
import { useState } from "react";
export const Compatibility: Story = {
  render: () => (
    <div className="grid max-w-3xl grid-cols-2 gap-6 p-8">
      <div data-parity="source" className="grid justify-items-start gap-4">
        <h2>Copy Singer source</h2>
        <Button>Generate</Button>
        <Button variant="outline">Choose model</Button>
        <Button disabled>Disabled</Button>
        <Input aria-label="Source input" placeholder="Prompt" />
        <Input
          aria-label="Source invalid"
          aria-invalid
          defaultValue="Invalid"
        />
      </div>
      <div data-parity="adapter" className="grid justify-items-start gap-4">
        <h2>Leesfield adapter</h2>
        <AppButton>Generate</AppButton>
        <AppButton variant="surface">Choose model</AppButton>
        <AppButton disabled>Disabled</AppButton>
        <AppInput aria-label="Adapter input" placeholder="Prompt" />
        <AppInput
          aria-label="Adapter invalid"
          aria-invalid
          defaultValue="Invalid"
        />
      </div>
    </div>
  ),
};
function DialogReview() {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-8">
      <AppButton onClick={() => setOpen(true)}>Open dialog</AppButton>
      <AppDialog open={open} onOpenChange={setOpen}>
        <AppDialogContent size="sm">
          <AppDialogTitle>Dialog</AppDialogTitle>
          <AppDialogDescription>
            Keyboard, focus and portal review.
          </AppDialogDescription>
          <AppInput aria-label="Dialog input" />
          <AppButton onClick={() => setOpen(false)}>Done</AppButton>
        </AppDialogContent>
      </AppDialog>
    </div>
  );
}
export const DialogState: Story = { render: () => <DialogReview /> };
