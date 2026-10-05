import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { storybookImage } from "@/test-utils/fixtures/storybook-media";
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
        <div className="mx-auto max-w-5xl overflow-hidden rounded-[1.75rem]">
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
      // eslint-disable-next-line @next/next/no-img-element
      <img src={storybookImage.url} alt={storybookImage.alt} className="h-full w-full object-cover" />
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

export const Queued: Story = { args: { isGenerating: true, status: "pending" } };
export const Uploading: Story = { args: { isGenerating: true, status: "uploading" } };
