import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LandingPlatformClientSection } from "@/widgets/landing/ui/landing-platform-section-client";

const featuredModels = [
  {
    key: "gpt-image-2",
    label: "GPT Image 2",
    vendor: "OpenAI",
    provider: "codex_bridge",
    modality: "Image",
    asset: "/assets/creative-studio/studio-vocalist.jpg",
  },
  {
    key: "veo-3.1",
    label: "Veo 3.1",
    vendor: "Google",
    provider: "gradio",
    modality: "Video",
    asset: "/assets/creative-studio/film-production.jpg",
  },
  {
    key: "qwen3-tts",
    label: "Qwen3 TTS",
    vendor: "Qwen",
    provider: "gradio",
    modality: "Audio",
    asset: "/assets/creative-studio/audio-console.jpg",
  },
] as const;

const monitoring = {
  totalCount: 12486,
  successRate: 97.8,
  trend: [
    { day: "04/24", requests: 920, errors: 18 },
    { day: "04/25", requests: 1240, errors: 19 },
    { day: "04/26", requests: 1168, errors: 21 },
    { day: "04/27", requests: 1492, errors: 22 },
    { day: "04/28", requests: 1860, errors: 31 },
    { day: "04/29", requests: 1735, errors: 24 },
    { day: "04/30", requests: 2110, errors: 27 },
  ],
  usage: [
    { name: "GPT Image 2", value: 42, total: 5244, color: "#d4f032" },
    { name: "Veo 3.1", value: 28, total: 3496, color: "#f5f2df" },
    { name: "Qwen3 TTS", value: 19, total: 2372, color: "#9e8cff" },
    { name: "Flux Kontext", value: 11, total: 1374, color: "#6ee7b7" },
  ],
};

const meta = {
  title: "Project Design/Landing/PlatformSection",
  component: LandingPlatformClientSection,
  args: {
    featuredModels: [...featuredModels],
    monitoring,
  },
} satisfies Meta<typeof LandingPlatformClientSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const FilledData: Story = {};

export const EmptyMonitoring: Story = {
  args: {
    featuredModels: [...featuredModels],
    monitoring: {
      totalCount: 0,
      successRate: null,
      trend: [],
      usage: [],
    },
  },
};
