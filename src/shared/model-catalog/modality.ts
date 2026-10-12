import { getGradioContract, gradioInputValues, fileFieldMaxItems, type GradioContract } from "./gradio-contract";
import type { RuntimeImageModel, RuntimeVideoModel, RuntimeAudioModel } from "./runtime-utils";

export type ModelModality = "T2I" | "I2I" | "T2V" | "I2V" | "T2A" | "A2A" | "V2V" | "A2V";

type GenerationModel = RuntimeImageModel | RuntimeVideoModel | RuntimeAudioModel;

/** Probe media requirements with the same validator used for submission, including anyOf groups. */
export function resolveGenerationCapabilities(model: GenerationModel): { modalities: string[]; audioReference: boolean } {
  const contract = getGradioContract(model);
  if (!contract) return { modalities: model.type === "image" ? resolveImageModalities(model.meta)
    : model.type === "video" ? resolveVideoModalities(model.meta) : resolveAudioModalities(model.meta), audioReference: false };
  return resolveContractGenerationCapabilities(contract, model.type);
}

export function resolveContractGenerationCapabilities(contract: GradioContract, type: GenerationModel["type"]): {modalities:string[];audioReference:boolean} {
  const inputs = contract.inputs.filter(field => ["file", "files", "gallery"].includes(field.kind) && field.media && !field.choices?.length && fileFieldMaxItems(field) > 0);
  const media = ["image", "video", "audio"] as const;
  const valid = new Set<number>();
  for (let mask = 0; mask < 8; mask++) {
    const dynamicParams: Record<string, unknown> = {};
    for (const field of contract.inputs) {
      if (inputs.includes(field)) {
        const parent = field.attachment ? inputs.find(input=>input.name===field.attachment!.pairedWith) : undefined;
        const enabled = (mask & (1 << media.indexOf(field.media!))) !== 0 && (!parent || (mask & (1 << media.indexOf(parent.media!))) !== 0);
        if (enabled && fileFieldMaxItems(field) > 0) {
          const url = "https://reference.example/asset";
          const count = field.kind === "file" ? 1 : Math.min(fileFieldMaxItems(field),parent ? fileFieldMaxItems(parent) : Infinity);
          dynamicParams[field.name] = field.kind === "file" ? url : Array.from({length:count},(_,index)=>url+"/"+index);
        } else if (field.default === undefined && !field.required) continue;
        else dynamicParams[field.name] = field.nullable ? null : field.kind === "file" ? "" : [];
      } else if (field.default !== undefined) dynamicParams[field.name] = field.default;
      else if (field.choices?.length) dynamicParams[field.name] = field.choiceMode === "multiple" ? [field.choices[0]] : field.choices[0];
      else if (field.required) dynamicParams[field.name] = field.kind === "number" ? field.min ?? 1
        : field.kind === "boolean" ? false : field.kind === "json" ? {} : "reference";
    }
    try {
      const values = gradioInputValues(contract, {prompt:"reference",dynamicParams});
      // An empty required file is invalid even when the source schema omits minItems.
      if (inputs.some(field => field.required && !field.allowEmpty && (values[field.name] === "" || Array.isArray(values[field.name]) && !(values[field.name] as unknown[]).length))) continue;
      // Don't infer support for a media type absent from the contract.
      if (media.some((type,index) => (mask & (1 << index)) && !inputs.some(field=>field.media === type &&
        (Array.isArray(values[field.name]) ? (values[field.name] as unknown[]).some(Boolean) : !!values[field.name])))) continue;
      valid.add(mask);
    } catch { /* Unsupported combinations receive no capability badge. */ }
  }
  const output = {image:"I",video:"V",audio:"A"}[type];
  const modalities = [...(valid.has(0) ? ["T2" + output] : []),
    ...media.flatMap((type,index) => (valid.has(1 << index) || type !== "audio" && valid.has((1 << index) | 4)) ? [{image:"I",video:"V",audio:"A"}[type] + "2" + output] : [])];
  return {modalities, audioReference: inputs.some(field=>field.media === "audio") && !valid.has(4) && [...valid].some(mask=>(mask & 4) && (mask & 3))};
}

export function resolveGenerationModalities(model: GenerationModel): string[] {
  return resolveGenerationCapabilities(model).modalities;
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
