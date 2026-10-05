import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { builtinPromptPresets } from "@/shared/prompt-presets/builtin-prompt-presets";
import type { PromptPreset } from "@/shared/prompt-presets/prompt-preset-contract";
import { PromptPresetsScreen } from "./prompt-presets-screen";
import { SpacesScreen } from "@/screens/spaces/ui/spaces-screen";
import { ModelManagementScreen } from "@/screens/model-management/ui/model-management-screen";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/shared/i18n/messages/en.json";
import { ImageGenerationForm } from "@/features/image-generation/ui/image-generation-form";
import { VideoGenerationForm } from "@/features/video-generation/ui/video-generation-form";
import { AudioGenerationForm } from "@/features/audio-generation/ui/audio-generation-form";
import { runtimeImageModelsFixture, runtimeVideoModelsFixture } from "@/test-utils/fixtures/runtime-model-catalog";
import { identityEditModel, multiImageAttachmentModel, videoAttachmentModel, imageToVideoAttachmentModel, audioAttachmentModel } from "@/test-utils/fixtures/media-attachment-models";

function CatalogPreview({ children, attachmentModels = false }: { children: ReactNode; attachmentModels?: boolean }) {
  const [client] = useState(() => {
    const query = new QueryClient({ defaultOptions: { queries: { enabled: false, staleTime: Infinity } } });
    query.setQueryData(["prompt-presets", "all", true], builtinPromptPresets.map<PromptPreset>(p => ({ ...p, builtinKey: p.key, builtinRevision: p.revision, defaultPrompt: p.prompt, isActive: true, isModified: false })).concat([
      { key: "video-i2v-preview", revision: 1, name: "I2V video preset", description: "Video from an initial image", modality: "video", prompt: "Animate the reference", requiredInputs: { referenceImageCount: 1 }, recommendedParameters: { aspectRatio: "16:9" }, builtinKey: null, builtinRevision: null, defaultPrompt: null, isActive: true, isModified: false },
    ]));
    for (const modality of ["image", "video", "audio"] as const) {
      query.setQueryData(["prompt-presets", modality, false], modality === "image"
        ? builtinPromptPresets.map<PromptPreset>(p => ({ ...p, builtinKey: p.key, builtinRevision: p.revision, defaultPrompt: p.prompt, isActive: true, isModified: false }))
        : [{ key: modality + "-chip-preview", name: modality === "video" ? "카메라 움직임" : "따뜻한 나레이션",
            description: "", modality, revision: 1, prompt: modality === "video" ? "Use a slow cinematic camera." : "Speak with a warm voice.",
            requiredInputs: { referenceImageCount: 0 }, recommendedParameters: {}, builtinKey: null, builtinRevision: null, defaultPrompt: null, isActive: true, isModified: false }]);
    }
    query.setQueryData(["runtime-models"], attachmentModels ? [identityEditModel, multiImageAttachmentModel, videoAttachmentModel, {...imageToVideoAttachmentModel,isDefault:false}, audioAttachmentModel] : [
      ...runtimeImageModelsFixture,
      ...runtimeVideoModelsFixture.map(m => ({ ...m, parameters: { ...m.parameters, initImage: { ...m.parameters.initImage, required: false } }, meta: { ...m.meta, supports_init_image: false } })),
      { type: "audio", key: "qwen-tts", label: "Qwen 3.5 TTS", vendor: "HF Space", provider: "huggingface-space", providerConfig: {},
        parameters: { voice: { default: "alloy" }, speed: { default: 1, min: 0.25, max: 4 } }, meta: { supports_input_audio: false }, isActive: true, isDefault: true },
    ]);
    query.setQueryData(["generation-graphs"], ["Character studies", "Location scouting", "Camera coverage"].map((title, index) => ({
      id: "space-preview-" + index, title, version: 1, schemaVersion: 3, minimumWriterVersion: 3,
      createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
    })));
    query.setQueryData(["admin-models"], [
      { type: "image", key: "image-preview", label: "Image reference model", meta: { pipeline: "flux", model_id: "example/image", max_input_images: 1 } },
      { type: "video", key: "video-preview", label: "Video reference model", meta: { supports_init_image: true, t2v_model_id: "example/video" } },
      { type: "audio", key: "audio-preview", label: "Audio reference model", meta: { model_id: "example/audio" } },
      { type: "llm", key: "assistant-preview", label: "Assistant reference model", meta: {} },
      {...multiImageAttachmentModel, provider:"hf_space", providerConfig:multiImageAttachmentModel.providerConfig as Record<string, unknown>}].map(model => ({ ...model, id: model.key, vendor: model.type === "llm" ? "API" : "HUGGINGFACE",
      provider: model.type === "llm" ? "openai_compatible" : "hf_space",
      providerConfig: "providerConfig" in model ? model.providerConfig : model.type === "llm" ? { base_url: "https://api.example.com/v1", model_id: "assistant-preview", supports_images: true } : {}, parameters: "parameters" in model ? model.parameters : {},
      isActive: true, isDefault: false, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" })));
    return query;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const meta = {
  title: "Project Design/Presets/Management", component: PromptPresetsScreen,
  decorators: [(Story) => <CatalogPreview><div className="px-4 sm:px-8"><Story /></div></CatalogPreview>],
} satisfies Meta<typeof PromptPresetsScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Spaces: Story = { render: () => <SpacesScreen /> };
export const Models: Story = { render: () => <ModelManagementScreen /> };
export const English: Story = { decorators: [(Story) => <NextIntlClientProvider locale="en" messages={enMessages} timeZone="Asia/Seoul"><Story /></NextIntlClientProvider>] };
export const ImageComposer: Story = { render: () => <ImageGenerationForm isAuthenticated /> };
export const VideoComposer: Story = { render: () => <VideoGenerationForm isAuthenticated /> };
export const AudioComposer: Story = { render: () => <AudioGenerationForm isAuthenticated /> };
export const IdentityEditComposer: Story = { render: () => <CatalogPreview attachmentModels><ImageGenerationForm isAuthenticated /></CatalogPreview> };
export const VideoReferenceComposer: Story = { render: () => <CatalogPreview attachmentModels><VideoGenerationForm isAuthenticated /></CatalogPreview> };
export const AudioReferenceComposer: Story = { render: () => <CatalogPreview attachmentModels><AudioGenerationForm isAuthenticated /></CatalogPreview> };
