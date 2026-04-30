import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppEyebrow, AppHeading } from "@/shared/ui/app-typography";

const meta = {
  title: "Project Design/App/AppTypography",
  component: AppHeading,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppHeading>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Headings: Story = {
  render: () => (
    <div className="max-w-5xl space-y-8">
      <div>
        <AppEyebrow>IMAGE STUDIO</AppEyebrow>
        <AppHeading as="h1" size="studio" className="mt-4">
          Create images with control.
        </AppHeading>
      </div>
      <AppHeading as="h2" size="section">
        Project section heading.
      </AppHeading>
      <AppHeading as="h3" size="compact">
        Compact card heading.
      </AppHeading>
    </div>
  ),
};
