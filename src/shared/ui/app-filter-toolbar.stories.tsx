import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AudioLines, Grid2X2, Image as ImageIcon, Video } from "lucide-react";
import {
  AppFilterGroup,
  AppFilterToolbar,
  AppFilterToggle,
  AppSearchField,
  AppSortSelect,
} from "@/shared/ui/app-filter-toolbar";

const meta = {
  title: "Project Design/App/AppFilterToolbar",
  component: AppFilterToolbar,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppFilterToolbar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const HistoryControls: Story = {
  render: () => (
    <AppFilterToolbar className="max-w-7xl">
      <AppFilterGroup>
        <AppFilterToggle active icon={<Grid2X2 className="h-4 w-4" />}>
          All
        </AppFilterToggle>
        <AppFilterToggle icon={<ImageIcon className="h-4 w-4" />}>
          Image
        </AppFilterToggle>
        <AppFilterToggle icon={<Video className="h-4 w-4" />}>
          Video
        </AppFilterToggle>
        <AppFilterToggle icon={<AudioLines className="h-4 w-4" />}>
          Audio
        </AppFilterToggle>
        <AppFilterToggle>Completed</AppFilterToggle>
        <AppFilterToggle>Failed</AppFilterToggle>
      </AppFilterGroup>
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row lg:max-w-3xl">
        <AppSearchField
          placeholder="Search by prompt, model, or tags..."
          aria-label="Search history"
        />
        <AppSortSelect
          value="date_desc"
          onValueChange={() => {}}
          ariaLabel="Sort history"
          options={[
            { value: "date_desc", label: "Newest first" },
            { value: "date_asc", label: "Oldest first" },
          ]}
        />
      </div>
    </AppFilterToolbar>
  ),
};
