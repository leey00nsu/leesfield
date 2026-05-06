import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppResultFrame } from "@/shared/ui/app-result-frame";

type AppResultFramePreviewProps = {
  state: "empty" | "loading" | "result";
  minHeight: "sm" | "md" | "lg";
};

function AppResultFramePreview({ state, minHeight }: AppResultFramePreviewProps) {
  return (
    <AppResultFrame
      className={`grid place-items-center rounded-[1.75rem] ${
        minHeightClassNames[minHeight]
      }`}
    >
      {state === "loading" ? (
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      ) : state === "result" ? (
        <div className="h-full w-full rounded-[1.35rem] bg-[url('/assets/creative-studio/mirror-portrait.jpg')] bg-cover bg-center" />
      ) : (
        <div className="text-center">
          <p className="font-semibold text-white">Generated result</p>
          <p className="mt-2 text-sm text-white/52">Appears below the studio intro.</p>
        </div>
      )}
    </AppResultFrame>
  );
}

const meta = {
  title: "Project Design/App/AppResultFrame",
  component: AppResultFramePreview,
  args: {
    state: "empty",
    minHeight: "md",
  },
  argTypes: {
    state: { control: "select", options: ["empty", "loading", "result"] },
    minHeight: { control: "select", options: ["sm", "md", "lg"] },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppResultFramePreview>;

export default meta;

type Story = StoryObj<typeof meta>;

const minHeightClassNames = {
  sm: "min-h-56",
  md: "min-h-80",
  lg: "min-h-[32rem]",
};

export const EmptyFrame: Story = {
  render: (args) => <AppResultFramePreview {...args} />,
};
