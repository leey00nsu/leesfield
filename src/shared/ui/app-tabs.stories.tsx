import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppExpandableText } from "@/shared/ui/app-expandable-text";
import { AppTabs } from "@/shared/ui/app-tabs";

const meta = {
  title: "Project Design/App/AppTabs",
  component: AppTabs,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <div className="ml-auto max-w-md rounded-2xl border border-white/12 bg-black/32 p-5">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof AppTabs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DetailRail: Story = {
  args: {
    ariaLabel: "Result detail sections",
    items: [],
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
                bodyClassName="rounded-xl border border-white/10 bg-black/18 p-4 text-sm leading-6 text-white/68"
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
