import { getGradioContract } from "./gradio-contract";
import type { RuntimeImageModel, RuntimeVideoModel, RuntimeAudioModel } from "./runtime-utils";

export type ModelModality = "T2I" | "I2I" | "T2V" | "I2V" | "T2A" | "A2A";

/** Mapped providers describe their real media inputs; legacy models use metadata. */
export function resolveGenerationModalities(model: RuntimeImageModel | RuntimeVideoModel | RuntimeAudioModel): string[] {
  const contract = getGradioContract(model);
  if (!contract) return model.type === "image" ? resolveImageModalities(model.meta)
    : model.type === "video" ? resolveVideoModalities(model.meta) : resolveAudioModalities(model.meta);
  const inputs = contract.inputs.filter(field => ["file", "files", "gallery"].includes(field.kind) && field.media && !field.choices?.length);
  const output = { image: "I", video: "V", audio: "A" }[model.type];
  const types = new Set<string>();
  if (!inputs.some(field => field.required && !(field.nullable && field.default === null))) types.add("T2" + output);
  for (const field of inputs) types.add({ image: "I", video: "V", audio: "A" }[field.media!] + "2" + output);
  return [...types];
}

type ImageModalitySource =
  | { maxInputImages?: number | null }
  | { max_input_images?: number | null };

type VideoModalitySource =
  | {
      supportsInitImage?: boolean;
      t2vModelId?: string | null;
      i2vModelId?: string | null;
    }
  | {
      supports_init_image?: boolean;
      t2v_model_id?: string | null;
      i2v_model_id?: string | null;
    };

type AudioModalitySource =
  | {
      supportsInputAudio?: boolean;
    }
  | {
      supports_input_audio?: boolean;
    };

function resolveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function resolveString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function resolveBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

export function resolveImageModalities(source?: ImageModalitySource): ModelModality[] {
  const modalities: ModelModality[] = ["T2I"];
  if (!source || typeof source !== "object") return modalities;

  const maxInputImages =
    "maxInputImages" in source
      ? resolveNumber(source.maxInputImages)
      : "max_input_images" in source
        ? resolveNumber(source.max_input_images)
        : 0;

  if (maxInputImages > 0) {
    modalities.push("I2I");
  }

  return modalities;
}

export function resolveVideoModalities(source?: VideoModalitySource): ModelModality[] {
  if (!source || typeof source !== "object") return ["T2V"];

  const supportsInitImage =
    "supportsInitImage" in source
      ? resolveBoolean(source.supportsInitImage)
      : "supports_init_image" in source
        ? resolveBoolean(source.supports_init_image)
        : false;
  const t2vModelId =
    "t2vModelId" in source
      ? resolveString(source.t2vModelId)
      : "t2v_model_id" in source
        ? resolveString(source.t2v_model_id)
        : "";
  const i2vModelId =
    "i2vModelId" in source
      ? resolveString(source.i2vModelId)
      : "i2v_model_id" in source
        ? resolveString(source.i2v_model_id)
        : "";

  const modalities: ModelModality[] = [];

  if (t2vModelId) {
    modalities.push("T2V");
  }

  if (supportsInitImage || i2vModelId) {
    modalities.push("I2V");
  }

  if (modalities.length === 0) {
    modalities.push("T2V");
  }

  return modalities;
}

export function resolveAudioModalities(source?: AudioModalitySource): ModelModality[] {
  const modalities: ModelModality[] = ["T2A"];
  if (!source || typeof source !== "object") return modalities;

  const supportsInputAudio =
    "supportsInputAudio" in source
      ? resolveBoolean(source.supportsInputAudio)
      : "supports_input_audio" in source
        ? resolveBoolean(source.supports_input_audio)
        : false;

  if (supportsInputAudio) {
    modalities.push("A2A");
  }

  return modalities;
}
