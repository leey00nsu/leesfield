import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppExpandableText } from "@/shared/ui/app-expandable-text";
import { AppTabs } from "@/shared/ui/app-tabs";

type AppTabsPreviewProps = {
  defaultValue: "prompt" | "settings" | "metadata" | "history";
  tabCount: 2 | 3 | 4;
  dense: boolean;
};

function AppTabsPreview({ defaultValue, tabCount, dense }: AppTabsPreviewProps) {
  const items = [
    {
      value: "prompt",
      label: "Prompt",
      content: (
        <div className="grid gap-3">
          <div className="text-sm font-semibold text-white">Full prompt</div>
          <AppExpandableText
            showMoreLabel="Show more"
            showLessLabel="Show less"
            className="rounded-xl border border-white/10 bg-black/18 p-4"
            bodyClassName="text-sm leading-6 text-white/68"
          >
            A majestic mountain landscape at golden hour with dramatic clouds,
            a winding river through the valley, precise camera direction,
            cinematic light, and a reusable photorealistic style.
          </AppExpandableText>
        </div>
      ),
    },
    {
      value: "settings",
      label: "Settings",
      content: (
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <dt className="text-white/42">Model</dt>
          <dd className="text-white">Leesfield V2</dd>
          <dt className="text-white/42">Status</dt>
          <dd className="text-white">Completed</dd>
        </dl>
      ),
    },
    {
      value: "metadata",
      label: "Metadata",
      content: <div className="text-sm text-white/64">Request ID and timing</div>,
    },
    {
      value: "history",
      label: "History",
      content: <div className="text-sm text-white/64">Input and output assets</div>,
    },
  ].slice(0, tabCount);

  return (
    <AppTabs
      ariaLabel="Result detail sections"
      defaultValue={defaultValue}
      items={items}
      listClassName={dense ? "text-xs" : undefined}
    />
  );
}

const meta = {
  title: "Project Design/App/AppTabs",
  component: AppTabsPreview,
  args: {
    defaultValue: "prompt",
    tabCount: 4,
    dense: false,
  },
  argTypes: {
    defaultValue: {
      control: "select",
      options: ["prompt", "settings", "metadata", "history"],
    },
    tabCount: { control: "select", options: [2, 3, 4] },
    dense: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <div className="ml-auto max-w-md rounded-2xl border border-white/12 bg-black/32 p-5">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof AppTabsPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => <AppTabsPreview {...args} />,
};

export const DetailRail: Story = {
  args: {
    defaultValue: "prompt",
    tabCount: 4,
    dense: false,
  },
  render: () => (
    <AppTabs
      ariaLabel="Result detail sections"
      items={[
        {
          value: "prompt",
          label: "Prompt",
          content: (
            <div className="grid gap-3">
              <div className="text-sm font-semibold text-white">Full prompt</div>
              <AppExpandableText
                showMoreLabel="Show more"
                showLessLabel="Show less"
                className="rounded-xl border border-white/10 bg-black/18 p-4"
                bodyClassName="text-sm leading-6 text-white/68"
              >
                A majestic mountain landscape at golden hour with dramatic clouds,
                a winding river through the valley, precise camera direction,
                cinematic light, and a reusable photorealistic style.
              </AppExpandableText>
            </div>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <dt className="text-white/42">Model</dt>
              <dd className="text-white">Leesfield V2</dd>
              <dt className="text-white/42">Status</dt>
              <dd className="text-white">Completed</dd>
            </dl>
          ),
        },
        {
          value: "metadata",
          label: "Metadata",
          content: <div className="text-sm text-white/64">Request ID and timing</div>,
        },
        {
          value: "history",
          label: "History",
          content: <div className="text-sm text-white/64">Input and output assets</div>,
        },
      ]}
    />
  ),
};
