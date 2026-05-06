import type { GenerationModality } from "@/shared/generation/generation-presets";
import type { ModelModality } from "@/shared/model-catalog/modality";

export type ModelOutcomeProfile =
  | "imageRapid"
  | "imageEditorial"
  | "imagePrecise"
  | "imageDefault"
  | "videoCinematic"
  | "videoDefault"
  | "audioVoiceover"
  | "audioDefault";

export type ModelOutcomeTone = GenerationModality;

export type ModelOutcomeMetadata = {
  profile: ModelOutcomeProfile;
  tone: ModelOutcomeTone;
  tags: ModelModality[];
  strengthKeys: string[];
};

type ResolveModelOutcomeMetadataInput = {
  key: string;
  type: GenerationModality;
  modalities?: readonly string[];
};

type ModelOutcomeProfileConfig = Pick<
  ModelOutcomeMetadata,
  "profile" | "tone" | "strengthKeys"
>;

const knownProfiles: Record<string, ModelOutcomeProfileConfig> = {
  "z-image-turbo": {
    profile: "imageRapid",
    tone: "image",
    strengthKeys: ["speed", "composition"],
  },
  "flux2-klein-9b": {
    profile: "imageEditorial",
    tone: "image",
    strengthKeys: ["reference", "detail"],
  },
  "gpt-image-2-codex": {
    profile: "imagePrecise",
    tone: "image",
    strengthKeys: ["instruction", "editing"],
  },
  "gpt-image-2-bridge": {
    profile: "imagePrecise",
    tone: "image",
    strengthKeys: ["instruction", "editing"],
  },
  "wan2-2-hf": {
    profile: "videoCinematic",
    tone: "video",
    strengthKeys: ["motion", "reference"],
  },
  "qwen-tts": {
    profile: "audioVoiceover",
    tone: "audio",
    strengthKeys: ["voice", "pacing"],
  },
};

const fallbackProfiles = {
  image: {
    profile: "imageDefault",
    tone: "image",
    tags: ["T2I"],
    strengthKeys: ["speed", "composition"],
  },
  video: {
    profile: "videoDefault",
    tone: "video",
    tags: ["T2V"],
    strengthKeys: ["motion", "pacing"],
  },
  audio: {
    profile: "audioDefault",
    tone: "audio",
    tags: ["T2A"],
    strengthKeys: ["voice", "pacing"],
  },
} satisfies Record<GenerationModality, ModelOutcomeMetadata>;

function normalizeTags(
  type: GenerationModality,
  modalities: readonly string[] | undefined,
): ModelModality[] {
  const normalized = (modalities ?? [])
    .map((modality) => modality.trim().toUpperCase())
    .filter((modality): modality is ModelModality =>
      ["T2I", "I2I", "T2V", "I2V", "T2A", "A2A"].includes(modality),
    );

  return normalized.length > 0 ? normalized : fallbackProfiles[type].tags;
}

export function resolveModelOutcomeMetadata({
  key,
  type,
  modalities,
}: ResolveModelOutcomeMetadataInput): ModelOutcomeMetadata {
  const knownProfile =
    knownProfiles[key] ??
    (key.startsWith("qwen-tts") ? knownProfiles["qwen-tts"] : undefined);
  const base = knownProfile ?? fallbackProfiles[type];

  return {
    profile: base.profile,
    tone: base.tone,
    tags: normalizeTags(type, modalities),
    strengthKeys: [...base.strengthKeys],
  };
}
