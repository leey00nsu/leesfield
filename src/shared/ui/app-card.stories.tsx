import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppCard, AppCardContent } from "@/shared/ui/app-card";
import { AppButton } from "@/shared/ui/app-button";
import { AppEyebrow, AppHeading } from "@/shared/ui/app-typography";

const meta = {
  title: "Project Design/App/AppCard",
  component: AppCard,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Surfaces: Story = {
  render: () => (
    <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
      <AppCard variant="editorial" className="rounded-[1.4rem] p-6">
        <AppEyebrow>EDITORIAL</AppEyebrow>
        <AppHeading as="h2" size="compact" className="mt-5">
          Editorial surface
        </AppHeading>
        <p className="mt-4 text-sm leading-6 text-white/62">
          Shared project surface wrapped over the shadcn card primitive.
        </p>
      </AppCard>
      <AppCard variant="outline-map" className="rounded-[1.4rem] p-8">
        <AppCardContent>
          <AppHeading as="h2" size="compact">Design with leesfield</AppHeading>
          <p className="mt-4 text-white/62">Topographic CTA pattern.</p>
          <AppButton className="mt-8 rounded-full">Get started</AppButton>
        </AppCardContent>
      </AppCard>
    </div>
  ),
};
