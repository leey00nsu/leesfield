import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ApiKeyCard } from "@/features/api-key-management/ui/api-key-card";
import { ApiKeyList } from "@/features/api-key-management/ui/api-key-list";

const meta = {
  title: "Project Design/API Key/ApiKeyCard",
  component: ApiKeyCard,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <div className="mx-auto max-w-6xl">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ApiKeyCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Active: Story = {
  args: {
    name: "Production",
    maskedKey: "lf_live_aaaa...bbbb",
    status: "active",
    lastUsedLabel: "2분 전",
    createdAtLabel: "2026. 05. 04.",
    onEdit: () => {},
  },
};

export const KeyList: Story = {
  args: {
    name: "Production",
    maskedKey: "lf_live_aaaa...bbbb",
    status: "active",
    lastUsedLabel: "2분 전",
    createdAtLabel: "2026. 05. 04.",
    onEdit: () => {},
  },
  render: () => (
    <ApiKeyList
      items={[
        {
          id: "key-1",
          name: "Production",
          maskedKey: "lf_live_aaaa...bbbb",
          status: "active",
          lastUsedLabel: "2분 전",
          createdAtLabel: "2026. 05. 04.",
          onEdit: () => {},
        },
        {
          id: "key-2",
          name: "Legacy",
          maskedKey: "lf_live_cccc...dddd",
          status: "revoked",
          lastUsedLabel: "사용 기록 없음",
          createdAtLabel: "2026. 04. 12.",
          onEdit: () => {},
        },
      ]}
    />
  ),
};

export const Empty: Story = {
  args: {
    name: "Production",
    maskedKey: "lf_live_aaaa...bbbb",
    status: "active",
    lastUsedLabel: "2분 전",
    createdAtLabel: "2026. 05. 04.",
    onEdit: () => {},
  },
  render: () => <ApiKeyList items={[]} emptyMessage="API 키가 없습니다." />,
};
