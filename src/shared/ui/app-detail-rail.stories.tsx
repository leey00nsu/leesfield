import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Copy, Sparkles, X } from "lucide-react";
import { AppButton } from "@/shared/ui/app-button";
import { AppDetailRail, AppDetailSection } from "@/shared/ui/app-detail-rail";
import { AppEyebrow } from "@/shared/ui/app-typography";

const meta = {
  title: "Project Design/App/AppDetailRail",
  component: AppDetailRail,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <div className="ml-auto h-[42rem] max-w-sm">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof AppDetailRail>;

export default meta;

type Story = StoryObj<typeof meta>;

export const HistoryResult: Story = {
  render: () => (
    <AppDetailRail
      header={
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-black">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <AppEyebrow className="text-[0.68rem]">IMAGE RESULT</AppEyebrow>
              <div className="mt-1 font-semibold text-white">FLUX.2 Klein 9B</div>
            </div>
          </div>
          <AppButton variant="ghost" size="icon-sm" aria-label="Close">
            <X className="h-4 w-4" />
          </AppButton>
        </div>
      }
      footer={<AppButton className="w-full">Recreate</AppButton>}
    >
      <div className="grid gap-4">
        <AppDetailSection>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-white/42">
              Prompt
            </span>
            <AppButton variant="surface" size="sm">
              <Copy className="h-3.5 w-3.5" />
              Copy
            </AppButton>
          </div>
          <p className="text-sm leading-6 text-white/68">
            A precise editorial image with reusable lighting, composition, and
            camera direction.
          </p>
        </AppDetailSection>
        <AppDetailSection>
          <dl className="grid gap-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-white/42">Status</dt>
              <dd className="font-semibold text-white">Completed</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-white/42">Date</dt>
              <dd className="font-semibold text-white">Apr 30, 2026</dd>
            </div>
          </dl>
        </AppDetailSection>
      </div>
    </AppDetailRail>
  ),
};
