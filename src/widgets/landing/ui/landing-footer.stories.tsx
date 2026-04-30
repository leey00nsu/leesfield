import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LandingFooter } from "@/widgets/landing/ui/landing-footer";

const meta = {
  title: "Project Design/Landing/Footer",
  component: LandingFooter,
} satisfies Meta<typeof LandingFooter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
