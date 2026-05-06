import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CtaCard } from "@/shared/ui/cta-card";

const meta = {
  title: "Project Design/Landing/CtaCard",
  component: CtaCard,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background px-6 py-12 sm:px-10">
        <div className="mx-auto max-w-[1180px]">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    title: "Design with leesfield",
    buttonText: "Get started now",
    href: "/image",
  },
} satisfies Meta<typeof CtaCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
