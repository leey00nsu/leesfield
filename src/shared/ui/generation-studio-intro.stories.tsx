import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GenerationStudioIntro } from "@/shared/ui/generation-studio-intro";

const meta = {
  title: "Project Design/Generation/StudioIntro",
  component: GenerationStudioIntro,
  decorators: [
    (Story) => (
      <div className="min-h-[32rem] bg-background px-4">
        <Story />
      </div>
    ),
  ],
  args: {
    eyebrow: "IMAGE STUDIO",
    title: "Create images with control.",
    description:
      "Describe your idea. Choose your settings. Generate with precision.",
  },
} satisfies Meta<typeof GenerationStudioIntro>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ImageStudio: Story = {};

export const AudioStudio: Story = {
  args: {
    eyebrow: "AUDIO STUDIO",
    title: "Shape sound with control.",
    description:
      "Describe the sound you need. Fine-tune the settings. Generate production-ready audio.",
  },
};

export const VideoStudio: Story = {
  args: {
    eyebrow: "VIDEO STUDIO",
    title: "Create motion with control.",
    description:
      "Describe your idea. We'll handle the camera, the movement, and the magic.",
  },
};
