import type { RuntimeAudioModel, RuntimeImageModel, RuntimeLlmModel } from "@/shared/model-catalog/runtime-utils";
import { mappedReferenceImageModelFixture, runtimeVideoModelsFixture } from "./runtime-model-catalog";

export const imageModel: RuntimeImageModel = { ...mappedReferenceImageModelFixture, key: "native-image", label: "Native Image", parameters: {},
  providerConfig: { gradio_contract: { version: 1, apiName: "/generate", diagnostics: [], reviewed: true, output: { media: "image", path: [0], multiple: false }, inputs: [
    { name: "prompt", label: "Prompt", kind: "string", required: true, nullable: false, canonical: "prompt", schema: { type: "string", minLength: 1 } },
    { name: "refs", label: "References", kind: "gallery", media: "image", required: false, nullable: false, default: [], schema: { type: "array", maxItems: 6, items: { type: "string" } } },
    { name: "seed", label: "Seed", kind: "number", required: false, nullable: false, default: 3, schema: { type: "integer", minimum: 0 } },
    { name: "enabled", label: "Enabled", kind: "boolean", required: false, nullable: false, default: true, schema: { type: "boolean" } },
    { name: "gain", label: "Optional gain", kind: "number", required: false, nullable: true, default: null, schema: { type: ["number", "null"] } },
    { name: "payload", label: "Payload", kind: "json", required: false, nullable: false, default: { quality: "draft" }, schema: { type: "object", additionalProperties: true } },
  ] } } };
export const otherImage: RuntimeImageModel = { ...imageModel, key: "native-image-two", label: "Second Image", provider: "fal", vendor: "FAL" };
export const audioModel: RuntimeAudioModel = { type: "audio", key: "native-drama", label: "Script Audio", provider: "hf_space", vendor: "Hugging Face", isActive: true, isDefault: false, parameters: {}, meta: {},
  providerConfig: { gradio_contract: { version: 1, apiName: "/generate", diagnostics: [], reviewed: true, output: { media: "audio", path: [0], multiple: false }, inputs: [
    { name: "script", label: "Script", kind: "string", required: true, nullable: false, canonical: "prompt", schema: { type: "string", minLength: 1 } },
    { name: "temperature", label: "Temperature", kind: "number", required: false, nullable: false, default: 0, schema: { type: "number", minimum: 0, maximum: 1 } },
  ] } } };
export const llm: RuntimeLlmModel = { type: "llm", key: "native-creative", label: "Creative LLM", vendor: "OpenAI", provider: "openai_compatible", isActive: true, isDefault: false,
  providerConfig: { base_url: "https://example.invalid/v1", model_id: "creative-fixture", supports_images: true } };
export const videoModel = { ...runtimeVideoModelsFixture[0], key: "native-video", label: "Native Video", meta: { ...runtimeVideoModelsFixture[0].meta, coverImage: undefined, pageUrl: undefined } };
