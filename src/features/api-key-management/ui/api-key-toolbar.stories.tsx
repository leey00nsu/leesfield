import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ApiKeyToolbar } from "@/features/api-key-management/ui/api-key-toolbar";
import { AppFilterToolbar } from "@/shared/ui/app-filter-toolbar";

type ApiKeyStatusFilter = "all" | "active" | "revoked";

function ApiKeyToolbarPreview() {
  const [filter, setFilter] = useState<ApiKeyStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [label, setLabel] = useState("Production key");

  return (
    <AppFilterToolbar>
      <ApiKeyToolbar
        filter={filter}
        onFilterChange={setFilter}
        searchInput={search}
        onSearchInputChange={setSearch}
        searchPlaceholder="Search keys..."
        newKeyLabel={label}
        onNewKeyLabelChange={setLabel}
        onGenerate={() => {}}
        isIssuing={false}
      />
    </AppFilterToolbar>
  );
}

const meta = {
  title: "Project Design/API Key/ApiKeyToolbar",
  component: ApiKeyToolbarPreview,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ApiKeyToolbarPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
