import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppSkeleton } from "@/shared/ui/app-skeleton";

type AppSkeletonPreviewProps = {
  surface: "default" | "media";
  shape: "line" | "card" | "avatar";
};

function AppSkeletonPreview({ surface, shape }: AppSkeletonPreviewProps) {
  if (shape === "avatar") {
    return <AppSkeleton surface={surface} className="h-16 w-16 rounded-full" />;
  }

  if (shape === "card") {
    return (
      <div className="w-[320px] rounded-2xl border border-white/10 bg-surface-dark p-4">
        <AppSkeleton surface={surface} className="h-36 rounded-xl" />
        <AppSkeleton surface={surface} className="mt-4 h-4 w-2/3" />
        <AppSkeleton surface={surface} className="mt-2 h-4 w-1/2" />
      </div>
    );
  }

  return <AppSkeleton surface={surface} className="h-4 w-[280px]" />;
}

const meta = {
  title: "Project Design/App/AppSkeleton",
  component: AppSkeletonPreview,
  args: {
    surface: "default",
    shape: "card",
  },
  argTypes: {
    surface: { control: "select", options: ["default", "media"] },
    shape: { control: "select", options: ["line", "card", "avatar"] },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppSkeletonPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
