import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { GenerationHistoryItem } from "@/entities/generation/model/types";
import { HistoryList } from "@/features/generation-history/ui/history-list";

const historyItems: GenerationHistoryItem[] = [
  {
    id: "hist_001",
    type: "image",
    status: "completed",
    prompt: "A cinematic portrait in dark water with controlled rim lighting.",
    model: "GPT Image 2",
    createdAt: "2026-04-29T12:20:00.000Z",
    resultUrl: "/assets/creative-studio/mirror-portrait.jpg",
    thumbnailUrl: "/assets/creative-studio/mirror-portrait.jpg",
    errorMessage: null,
  },
  {
    id: "hist_002",
    type: "video",
    status: "completed",
    prompt: "A studio camera move around a production crew and soft practical light.",
    model: "Wan 2.2",
    createdAt: "2026-04-29T12:24:00.000Z",
    resultUrl: "/sample-video.mp4",
    thumbnailUrl: "/assets/creative-studio/film-production.jpg",
    errorMessage: null,
  },
  {
    id: "hist_003",
    type: "audio",
    status: "completed",
    prompt: "A warm narration bed with clean studio presence and gentle pacing.",
    model: "Qwen TTS",
    createdAt: "2026-04-29T12:30:00.000Z",
    resultUrl: null,
    thumbnailUrl: null,
    errorMessage: null,
  },
  {
    id: "hist_004",
    type: "image",
    status: "processing",
    prompt: "An abstract mosaic texture study with editorial contrast.",
    model: "GPT Image 2",
    createdAt: "2026-04-29T12:34:00.000Z",
    resultUrl: "/assets/creative-studio/blue-mosaic.jpg",
    thumbnailUrl: "/assets/creative-studio/blue-mosaic.jpg",
    progress: 64,
    errorMessage: null,
  },
  {
    id: "hist_005",
    type: "image",
    status: "failed",
    prompt: "A failed generation item with visible status treatment.",
    model: "Flux",
    createdAt: "2026-04-29T12:38:00.000Z",
    resultUrl: null,
    thumbnailUrl: null,
    errorMessage: "Generation failed",
  },
  {
    id: "hist_006",
    type: "image",
    status: "completed",
    prompt: "A vocalist in a controlled studio setup with neutral background.",
    model: "GPT Image 2",
    createdAt: "2026-04-29T12:42:00.000Z",
    resultUrl: "/assets/creative-studio/studio-vocalist.jpg",
    thumbnailUrl: "/assets/creative-studio/studio-vocalist.jpg",
    errorMessage: null,
  },
];

const meta = {
  title: "Project Design/History/HistoryList",
  component: HistoryList,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HistoryList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  args: {
    items: historyItems,
  },
};

export const Loading: Story = {
  args: {
    items: [],
    isLoading: true,
  },
};

export const Empty: Story = {
  args: {
    items: [],
    emptyMessage: "No generation history yet.",
  },
};
