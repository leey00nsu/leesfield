import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Code2, KeyRound } from "lucide-react";
import { AppBadge } from "@/shared/ui/app-badge";
import { AppButton } from "@/shared/ui/app-button";
import { AppDocsSectionCard } from "@/shared/ui/app-docs-section-card";

const meta = {
  title: "Project Design/App/AppDocsSectionCard",
  component: AppDocsSectionCard,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppDocsSectionCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  args: {
    eyebrow: "API DOCUMENTATION",
    title: "API docs for the studio",
    description:
      "Shared app wrapper for the API docs page shell and repeated documentation sections.",
    action: <AppBadge variant="primary">v1</AppBadge>,
    children: (
      <>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <KeyRound className="h-4 w-4 text-primary" />
              Authentication
            </div>
            <p className="text-sm leading-6 text-white/60">
              Keep your `X-API-Key` in a secure server-side environment variable.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Code2 className="h-4 w-4 text-primary" />
              Snippets
            </div>
            <p className="text-sm leading-6 text-white/60">
              Copy requests, responses, and generated examples from a single surface.
            </p>
          </div>
        </div>
        <div className="mt-5">
          <AppButton variant="surface">View reference</AppButton>
        </div>
      </>
    ),
  },
  render: (args) => (
    <div className="max-w-5xl">
      <AppDocsSectionCard {...args} />
    </div>
  ),
};
