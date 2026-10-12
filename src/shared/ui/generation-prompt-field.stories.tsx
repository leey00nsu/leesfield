import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SlidersHorizontal, Sparkles } from "lucide-react";
import { AppButton } from "@/shared/ui/app-button";
import { GenerationModelSection } from "@/shared/ui/generation-model-section";
import { GenerationPromptField } from "@/shared/ui/generation-prompt-field";
import { GenerationSettingsPopover } from "@/shared/ui/generation-settings-popover";
import { GenerationPresetPicker } from "@/shared/ui/generation-preset-picker";
import { builtinPromptPresets } from "@/shared/prompt-presets/builtin-prompt-presets";
import { AppPromptEditor } from "@/shared/ui/app-prompt-editor";

type PromptPreviewModality = "image" | "video" | "audio";

const imageModels = [
  {
    id: "gpt-image-2",
    name: "GPT Image 2",
    vendor: "OpenAI",
    modalities: ["IMAGE"],
  },
  {
    id: "qwen-image-edit",
    name: "Qwen Image Edit",
    vendor: "Qwen",
    modalities: ["IMAGE"],
  },
  {
    id: "flux-kontext",
    name: "Flux Kontext",
    vendor: "Black Forest Labs",
    modalities: ["IMAGE"],
  },
] satisfies Array<{
  id: string;
  name: string;
  vendor: string;
  modalities: string[];
}>;

const modalityCopy: Record<
  PromptPreviewModality,
  { label: string; prompt: string; count: string; summary: string }
> = {
  image: {
    label: "Describe the image you want to generate...",
    prompt:
      "A reflective product study on a black glass table, lime rim light, editorial composition.",
    count: "118자",
    summary: "16:9",
  },
  video: {
    label: "Describe the motion, camera, and scene...",
    prompt:
      "A slow dolly shot through a midnight studio, soft practical lights, controlled motion.",
    count: "104자",
    summary: "5s",
  },
  audio: {
    label: "Describe the voice, rhythm, or sound...",
    prompt:
      "A calm Korean narration with a warm studio tone, precise pacing, production-ready finish.",
    count: "96자",
    summary: "Vivian",
  },
};

function PromptFieldPreview({
  modality = "image",
  surface = "default",
  disabled = false,
  generating = false,
  longPrompt = false,
}: {
  modality?: PromptPreviewModality;
  surface?: "default" | "hero";
  disabled?: boolean;
  generating?: boolean;
  longPrompt?: boolean;
}) {
  const [modelId, setModelId] = useState<(typeof imageModels)[number]["id"]>(
    "gpt-image-2",
  );
  const copy = modalityCopy[modality];
  const [prompt, setPrompt] = useState(longPrompt
    ? "같은 인물과 장소를 유지하고 카메라의 움직임, 조명과 분위기를 자연스럽게 표현한다.\n".repeat(80)
    : copy.prompt);

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className={longPrompt ? "fixed inset-x-4 bottom-5 mx-auto max-w-5xl" : "mx-auto max-w-5xl"}>
        <GenerationPromptField
          ariaLabel="Storybook generation prompt"
          surface={surface}
          promptMeta={`${prompt.length}자`}
          textarea={
            <>
              <AppPromptEditor
                aria-label="Prompt"
                disabled={disabled || generating}
                placeholder={copy.label}
                value={prompt}
                onChange={setPrompt}
              />
            </>
          }
          footerLeft={
            <>
              <GenerationModelSection
                modality="image"
                items={imageModels}
                activeId={modelId}
                onSelect={setModelId}
              />
              <GenerationSettingsPopover
                label="설정"
                summary={copy.summary}
                icon={<SlidersHorizontal className="h-4 w-4 text-white/62" />}
              >
                <div className="space-y-4 text-sm text-white/72">
                  <div>
                    <p className="font-semibold text-white">Aspect ratio</p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {["1:1", "16:9", "9:16"].map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm hover:border-primary/50"
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-white/48">
                    Storybook keeps the project-styled trigger and popover
                    treatment visible without documenting raw shadcn primitives.
                  </p>
                </div>
              </GenerationSettingsPopover>
              <GenerationPresetPicker
                items={modality === "image" ? builtinPromptPresets.map(p => ({ ...p, builtinKey: p.key, builtinRevision: p.revision, defaultPrompt: p.prompt, isActive: true, isModified: false })) : []}
                selected={null} onSelect={() => {}} onRetry={() => {}} onReapply={() => {}} onRestore={() => {}} onClear={() => {}}
              />
            </>
          }
          footerRight={
            <>
              <AppButton
                type="button"
                size="lg"
                disabled={disabled || generating}
                className="h-12 rounded-xl px-8 normal-case tracking-normal"
              >
                {generating ? "생성 중" : "생성"}
                <Sparkles className="h-4 w-4" />
              </AppButton>
            </>
          }
        />
      </div>
    </div>
  );
}

const meta = {
  title: "Project Design/Generation/PromptField",
  component: PromptFieldPreview,
  args: {
    modality: "image",
    surface: "default",
    disabled: false,
    generating: false,
  },
  argTypes: {
    modality: {
      control: "select",
      options: ["image", "video", "audio"],
    },
    surface: {
      control: "select",
      options: ["default", "hero"],
    },
    disabled: { control: "boolean" },
    generating: { control: "boolean" },
    longPrompt: { control: "boolean" },
  },
} satisfies Meta<typeof PromptFieldPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ImagePrompt: Story = {};

export const HeroPrompt: Story = {
  args: {
    surface: "hero",
  },
};

export const VideoPrompt: Story = {
  args: {
    modality: "video",
  },
};

export const AudioPrompt: Story = {
  args: {
    modality: "audio",
  },
};

export const LongImagePrompt: Story = { args: { longPrompt: true } };
export const LongVideoPrompt: Story = { args: { modality: "video", longPrompt: true } };
export const LongAudioPrompt: Story = { args: { modality: "audio", longPrompt: true } };
