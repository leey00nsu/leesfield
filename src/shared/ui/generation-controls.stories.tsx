import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Download, SlidersHorizontal } from "lucide-react";
import { getGenerationPresets } from "@/shared/generation/generation-presets";
import { GenerationHeaderActions } from "@/shared/ui/generation-header-actions";
import { GenerationModelSection } from "@/shared/ui/generation-model-section";
import { GenerationPresetStrip } from "@/shared/ui/generation-preset-strip";
import { GenerationSettingsPopover } from "@/shared/ui/generation-settings-popover";

const models = [
  { id: "gpt-image-2", name: "GPT Image 2", vendor: "OpenAI", modalities: ["IMAGE"] },
  { id: "wan-2-2", name: "Wan 2.2", vendor: "HuggingFace", modalities: ["VIDEO"] },
  { id: "qwen-tts", name: "Qwen TTS", vendor: "HuggingFace", modalities: ["AUDIO"] },
] satisfies Array<{
  id: "gpt-image-2" | "wan-2-2" | "qwen-tts";
  name: string;
  vendor: string;
  modalities: string[];
}>;

function GenerationControlsPreview() {
  const [modelId, setModelId] = useState<(typeof models)[number]["id"]>("gpt-image-2");

  return (
    <div className="grid max-w-5xl gap-8">
      <GenerationHeaderActions
        actions={[
          { label: "Download", icon: <Download className="h-4 w-4" /> },
          { label: "Disabled", disabled: true },
        ]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <GenerationModelSection
          modality="image"
          items={models}
          activeId={modelId}
          defaultId="gpt-image-2"
          onSelect={setModelId}
        />
        <GenerationSettingsPopover
          label="Settings"
          summary="16:9"
          icon={<SlidersHorizontal className="h-4 w-4 text-white/62" />}
        >
          <div className="grid gap-3 text-sm text-white/70">
            <p className="font-semibold text-white">Aspect ratio</p>
            <div className="grid grid-cols-3 gap-2">
              {["1:1", "16:9", "9:16"].map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 hover:border-primary/50"
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>
        </GenerationSettingsPopover>
      </div>
      <GenerationPresetStrip
        modality="image"
        items={getGenerationPresets("image")}
        onSelect={() => {}}
      />
    </div>
  );
}

const meta = {
  title: "Project Design/Generation/Controls",
  component: GenerationControlsPreview,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GenerationControlsPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
