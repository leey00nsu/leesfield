import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ApiKeyView } from "@/features/api-key-management/hook/use-api-keys";
import { ApiKeyEditModal } from "@/features/api-key-management/ui/api-key-edit-modal";
import { AppButton } from "@/shared/ui/app-button";

const apiKey: ApiKeyView = {
  id: "key_001",
  label: "Production key",
  maskedKey: "lf_live_••••••••••••_9K2",
  status: "active",
  createdAt: "2026-04-29T12:00:00.000Z",
  lastUsedAt: "2026-04-29T12:30:00.000Z",
  revokedAt: null,
  createdAtLabel: "Apr 29, 2026",
  lastUsedLabel: "Apr 29, 2026",
};

function ApiKeyEditModalPreview() {
  const [open, setOpen] = useState(true);
  const [label, setLabel] = useState(apiKey.label);

  return (
    <div className="min-h-screen bg-background-dark p-8 text-white">
      <AppButton type="button" onClick={() => setOpen(true)}>
        Open modal
      </AppButton>
      <ApiKeyEditModal
        open={open}
        apiKey={apiKey}
        label={label}
        error={null}
        isSaving={false}
        isRevoking={false}
        onLabelChange={setLabel}
        onClose={() => setOpen(false)}
        onSave={() => {}}
        onRevoke={() => {}}
      />
    </div>
  );
}

const meta = {
  title: "Project Design/API Key/ApiKeyEditModal",
  component: ApiKeyEditModalPreview,
} satisfies Meta<typeof ApiKeyEditModalPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
