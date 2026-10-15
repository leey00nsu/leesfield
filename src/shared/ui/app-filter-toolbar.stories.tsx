import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import {
  AudioLines,
  Grid2X2,
  Image as ImageIcon,
  Plus,
  Video,
} from "lucide-react";
import { AppButton } from "@/shared/ui/app-button";
import { AppDatePicker } from "@/shared/ui/app-calendar";
import {
  AppFilterGroup,
  AppFilterSection,
  AppFilterToolbar,
  AppFilterToggle,
  AppSearchField,
  AppSortSelect,
} from "@/shared/ui/app-filter-toolbar";

type Props = {
  active: "all" | "image" | "video" | "audio";
  search: boolean;
  sort: boolean;
  wrapWidth: "wide" | "narrow";
  monitoring?: boolean;
};
function Preview({
  active,
  search,
  sort,
  wrapWidth,
  monitoring = false,
}: Props) {
  const [type, setType] = useState(active),
    [query, setQuery] = useState(""),
    [order, setOrder] = useState("latest");
  const [date, setDate] = useState(new Date(2026, 9, 14));
  const options = [
    { value: "latest", label: "Newest" },
    { value: "oldest", label: "Oldest" },
  ];
  return (
    <div
      className={
        wrapWidth === "narrow" ? "w-full max-w-sm" : "w-full max-w-7xl"
      }
    >
      <AppFilterToolbar
        filterCount={Number(type !== "all") + Number(order !== "latest")}
        onResetFilters={() => {
          setType("all");
          setOrder("latest");
        }}
        searchActive={Boolean(query.trim())}
        search={
          search ? (
            <AppSearchField
              autoFocus
              placeholder="Search…"
              aria-label="Search library"
              value={query}
              onClear={() => setQuery("")}
            onChange={(e) => setQuery(e.target.value)}
            />
          ) : undefined
        }
        filters={
          <>
            <AppFilterSection label="Type">
              <AppFilterGroup>
                {(
                  [
                    { value: "all", label: "All", icon: Grid2X2 },
                    { value: "image", label: "Image", icon: ImageIcon },
                    { value: "video", label: "Video", icon: Video },
                    { value: "audio", label: "Audio", icon: AudioLines },
                  ] as const
                ).map(({ value, label, icon: Icon }) => (
                  <AppFilterToggle
                    key={value}
                    active={type === value}
                    aria-pressed={type === value}
                    onClick={() => setType(value)}
                    icon={<Icon className="size-4" />}
                  >
                    {label}
                  </AppFilterToggle>
                ))}
              </AppFilterGroup>
            </AppFilterSection>
            {sort && (
              <AppFilterSection label="Sort">
                <AppSortSelect
                  value={order}
                  onValueChange={setOrder}
                  options={options}
                  ariaLabel="Sort library"
                />
              </AppFilterSection>
            )}
            {monitoring && (
              <AppFilterSection label="Start date">
                <AppDatePicker
                  aria-label="Start date"
                  value={date}
                  onChange={setDate}
                />
              </AppFilterSection>
            )}
          </>
        }
      >
        <AppButton type="button" size="md">
          <Plus className="size-4" />
          New
        </AppButton>
      </AppFilterToolbar>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="aspect-square bg-card" />
        ))}
      </div>
    </div>
  );
}
const meta = {
  title: "Project Design/App/AppFilterToolbar",
  component: Preview,
  args: { active: "all", search: true, sort: true, wrapWidth: "wide" },
  argTypes: {
    active: { control: "select", options: ["all", "image", "video", "audio"] },
    search: { control: "boolean" },
    sort: { control: "boolean" },
    wrapWidth: { control: "select", options: ["wide", "narrow"] },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background p-4 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Preview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const HistoryControls: Story = {};
export const WrappedToolbar: Story = {
  args: { wrapWidth: "narrow", active: "video" },
};
export const MonitoringControls: Story = {
  args: { search: false, monitoring: true },
};
