import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ModelCatalogItem } from "@/features/model-management/model/model-catalog";
import { ModelList } from "@/features/model-management/ui/model-list";

const modelItems: ModelCatalogItem[] = [
  {
    type: "image",
    key: "gpt-image-2",
    label: "GPT Image 2",
    vendor: "OpenAI",
    provider: "openai",
    isActive: true,
    isDefault: true,
    meta: {
      pipeline: "image_generation",
      modelId: "gpt-image-2",
      defaultWidth: 1024,
      defaultHeight: 1024,
      defaultSteps: 30,
      maxInputImages: 4,
    },
  },
  {
    type: "video",
    key: "wan-2-2",
    label: "Wan 2.2",
    vendor: "HuggingFace",
    provider: "hf-space",
    isActive: true,
    isDefault: false,
    meta: {
      supportsInitImage: true,
      t2vModelId: "wan-t2v",
      i2vModelId: "wan-i2v",
      defaultWidth: 1280,
      defaultHeight: 720,
      defaultDurationSec: 5,
      defaultFps: 16,
      defaultSteps: 28,
      defaultGuidanceScale: 7.5,
    },
  },
  {
    type: "audio",
    key: "qwen-tts",
    label: "Qwen TTS",
    vendor: "HuggingFace",
    provider: "hf-space",
    isActive: false,
    isDefault: false,
    meta: {
      modelId: "qwen-tts",
      defaultSpeed: 1,
      supportsInputAudio: false,
    },
  },
];

const meta = {
  title: "Project Design/Model/ModelList",
  component: ModelList,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ModelList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Rows: Story = {
  args: {
    items: modelItems,
    onEdit: () => {},
  },
};

export const Empty: Story = {
  args: {
    items: [],
    emptyMessage: "No models match this filter.",
  },
};
