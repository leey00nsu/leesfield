import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Header } from "@/widgets/header/ui/header";

const meta = {
  title: "Project Design/Navigation/Header",
  component: Header,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Header>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PublicLoggedOut: Story = {
  args: {
    variant: "public",
    isAuthenticated: false,
  },
};

export const PublicLoggedIn: Story = {
  args: {
    variant: "public",
    isAuthenticated: true,
  },
};

export const Dashboard: Story = {
  args: {
    variant: "dashboard",
    isAuthenticated: true,
  },
};
