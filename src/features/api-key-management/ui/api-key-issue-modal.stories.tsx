import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { standardApiKeyPermissions } from "@/shared/api/platform-permissions";
import { ApiKeyIssueModal, type ApiKeyIssueModalProps } from "./api-key-issue-modal";

const meta = {
  title: "Project Design/API Key/ApiKeyIssueModal",
  component: ApiKeyIssueModal,
  args: {
    open: true, label: "Production", permissions: [...standardApiKeyPermissions], error: null,
    isIssuing: false, pendingKey: null, copied: false, copyError: null,
    onLabelChange: () => {}, onPermissionsChange: () => {}, onGenerate: () => {}, onClose: () => {}, onCopy: () => {},
  },
  render: function Preview(args: ApiKeyIssueModalProps) {
    const [label, setLabel] = useState(args.label);
    const [permissions, setPermissions] = useState(args.permissions);
    const [pendingKey, setPendingKey] = useState(args.pendingKey);
    const [copied, setCopied] = useState(false);
    return <ApiKeyIssueModal {...args} label={label} permissions={permissions} pendingKey={pendingKey}
      onLabelChange={setLabel} onPermissionsChange={setPermissions} copied={copied}
      onGenerate={() => setPendingKey({ label, apiKey: "lf_live_storybook_example_only" })} onCopy={() => setCopied(true)} />;
  },
} satisfies Meta<typeof ApiKeyIssueModal>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Input: Story = {};
export const Created: Story = { args: { pendingKey: { label: "Production", apiKey: "lf_live_storybook_example_only" } } };
export const Failed: Story = { args: { error: "API 키를 발급하지 못했습니다. 잠시 후 다시 시도해주세요." } };
export const Creating: Story = { args: { isIssuing: true } };
