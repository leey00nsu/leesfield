import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LandingHero } from "@/widgets/landing/ui/landing-hero";

const meta = {
  title: "Project Design/Landing/Hero",
  component: LandingHero,
} satisfies Meta<typeof LandingHero>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
