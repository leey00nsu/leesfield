import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AudioLines, Grid2X2, Image as ImageIcon, Video } from "lucide-react";
import {
  AppFilterGroup,
  AppFilterToolbar,
  AppFilterToggle,
  AppSearchField,
  AppSortSelect,
} from "@/shared/ui/app-filter-toolbar";

type AppFilterToolbarPreviewProps = {
  active: "all" | "image" | "video" | "audio";
  search: boolean;
  sort: boolean;
  wrapWidth: "wide" | "narrow";
};

function AppFilterToolbarPreview({
  active,
  search,
  sort,
  wrapWidth,
}: AppFilterToolbarPreviewProps) {
  return (
    <div className={wrapWidth === "narrow" ? "max-w-2xl" : "max-w-7xl"}>
      <AppFilterToolbar>
        <AppFilterGroup>
          <AppFilterToggle active={active === "all"} icon={<Grid2X2 className="h-4 w-4" />}>
            All
          </AppFilterToggle>
          <AppFilterToggle active={active === "image"} icon={<ImageIcon className="h-4 w-4" />}>
            Image
          </AppFilterToggle>
          <AppFilterToggle active={active === "video"} icon={<Video className="h-4 w-4" />}>
            Video
          </AppFilterToggle>
          <AppFilterToggle active={active === "audio"} icon={<AudioLines className="h-4 w-4" />}>
            Audio
          </AppFilterToggle>
        </AppFilterGroup>
        {search || sort ? (
          <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center lg:ml-auto lg:w-[43rem] lg:flex-none">
            {search ? (
              <AppSearchField
                containerClassName="sm:flex-1"
                placeholder="Search by prompt, model, or tags..."
                aria-label="Search history"
              />
            ) : null}
            {sort ? (
              <AppSortSelect
                className="h-14 sm:w-[12rem] sm:flex-none"
                value="date_desc"
                onValueChange={() => {}}
                ariaLabel="Sort history"
                options={[
                  { value: "date_desc", label: "Newest" },
                  { value: "date_asc", label: "Oldest" },
                ]}
              />
            ) : null}
          </div>
        ) : null}
      </AppFilterToolbar>
    </div>
  );
}

const meta = {
  title: "Project Design/App/AppFilterToolbar",
  component: AppFilterToolbarPreview,
  args: {
    active: "all",
    search: true,
    sort: true,
    wrapWidth: "wide",
  },
  argTypes: {
    active: { control: "select", options: ["all", "image", "video", "audio"] },
    search: { control: "boolean" },
    sort: { control: "boolean" },
    wrapWidth: { control: "select", options: ["wide", "narrow"] },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppFilterToolbarPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => <AppFilterToolbarPreview {...args} />,
};

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
      <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center lg:ml-auto lg:w-[43rem] lg:flex-none">
        <AppSearchField
          containerClassName="sm:flex-1"
          placeholder="Search by prompt, model, or tags..."
          aria-label="Search history"
        />
        <AppSortSelect
          className="h-14 sm:w-[12rem] sm:flex-none"
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

export const WrappedToolbar: Story = {
  render: () => (
    <div className="max-w-2xl">
      <AppFilterToolbar>
        <AppFilterGroup>
          {[
            "All",
            "Images",
            "Videos",
            "Audio",
            "Completed",
            "Failed",
            "Archived",
            "Favorites",
          ].map((label, index) => (
            <AppFilterToggle key={label} active={index === 0}>
              {label}
            </AppFilterToggle>
          ))}
        </AppFilterGroup>
        <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center lg:ml-auto lg:w-[43rem] lg:flex-none">
          <AppSearchField
            containerClassName="sm:flex-1"
            placeholder="Search by prompt, model, or tags..."
            aria-label="Search history"
          />
          <AppSortSelect
            className="h-14 sm:w-[12rem] sm:flex-none"
            value="date_desc"
            onValueChange={() => {}}
            ariaLabel="Sort history"
            options={[
              { value: "date_desc", label: "Newest" },
              { value: "date_asc", label: "Oldest" },
            ]}
          />
        </div>
      </AppFilterToolbar>
    </div>
  ),
};

export const MonitoringControls: Story = {
  render: () => (
    <AppFilterToolbar className="max-w-7xl">
      <AppFilterGroup>
        <AppFilterToggle active>7D</AppFilterToggle>
        <AppFilterToggle>30D</AppFilterToggle>
        <AppFilterToggle>Image</AppFilterToggle>
        <AppFilterToggle>Video</AppFilterToggle>
        <AppFilterToggle>Audio</AppFilterToggle>
      </AppFilterGroup>
      <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center lg:ml-auto lg:w-[32rem] lg:flex-none">
        <AppSortSelect
          className="h-14 sm:flex-1"
          value="all"
          onValueChange={() => {}}
          ariaLabel="Filter model"
          options={[
            { value: "all", label: "All models" },
            { value: "image", label: "Image models" },
            { value: "video", label: "Video models" },
          ]}
        />
      </div>
    </AppFilterToolbar>
  ),
};
