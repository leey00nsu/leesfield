import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Download, Maximize2 } from "lucide-react";
import { AppButton } from "@/shared/ui/app-button";
import { GenerationCanvas } from "@/shared/ui/generation-canvas";

const actions = (
  <>
    <AppButton variant="surface" size="icon-sm" aria-label="Preview fullscreen">
      <Maximize2 className="h-4 w-4" />
    </AppButton>
    <AppButton variant="surface" size="icon-sm" aria-label="Download result">
      <Download className="h-4 w-4" />
    </AppButton>
  </>
);

const meta = {
  title: "Project Design/Generation/ResultCanvas",
  component: GenerationCanvas,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background px-6 py-12">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-[1.75rem] border border-white/10">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    isGenerating: false,
    status: "idle",
    hasContent: true,
    actions,
    children: (
      <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_50%_20%,rgba(212,240,50,0.18),transparent_30%),linear-gradient(135deg,#20251c,#080908)]">
        <div className="rounded-full border border-primary/30 bg-black/28 px-5 py-2 text-sm font-semibold text-white/78">
          Generated result preview
        </div>
      </div>
    ),
  },
} satisfies Meta<typeof GenerationCanvas>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithResult: Story = {};

export const Empty: Story = {
  args: {
    hasContent: false,
    emptyState: (
      <div className="text-center">
        <p className="text-sm font-semibold text-white">Ready for a prompt</p>
        <p className="mt-2 text-sm text-white/52">
          Generated work will appear here.
        </p>
      </div>
    ),
    children: null,
  },
};

export const Generating: Story = {
  args: {
    isGenerating: true,
    status: "generating",
  },
};

export const Failed: Story = {
  args: {
    status: "failed",
    errorMessage: "The provider returned an unavailable response.",
  },
};
