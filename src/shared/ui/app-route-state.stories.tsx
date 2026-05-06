import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Loader2 } from "lucide-react";
import { AppRouteHomeAction, AppRouteState } from "@/shared/ui/app-route-state";

const meta = {
  title: "Project Design/App/AppRouteState",
  component: AppRouteState,
} satisfies Meta<typeof AppRouteState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NotFound: Story = {
  args: {
    eyebrow: "404",
    title: "PAGE NOT FOUND",
    description: "",
    action: <AppRouteHomeAction label="GO HOME" />,
  },
  render: () => (
    <main className="flex min-h-screen items-center justify-center bg-[#07090b] px-6 py-12 text-center text-white">
      <div>
        <h1 className="text-3xl font-semibold tracking-normal">PAGE NOT FOUND</h1>
        <div className="mt-8">
          <AppRouteHomeAction label="GO HOME" />
        </div>
      </div>
    </main>
  ),
};

export const ErrorState: Story = {
  args: {
    eyebrow: "ERROR",
    title: "Something went wrong.",
    description: "The page could not be rendered. Try returning home.",
    action: <AppRouteHomeAction label="GO HOME" />,
  },
};

export const Loading: Story = {
  args: {
    eyebrow: "LOADING",
    title: "Loading",
    description: "",
  },
  render: () => (
    <main className="flex min-h-screen items-center justify-center bg-[#07090b] text-white">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </main>
  ),
};
