export const generationModalities = ["image", "video", "audio"] as const;

export type GenerationModality = (typeof generationModalities)[number];

export type GenerationPreset = {
  id: string;
  modality: GenerationModality;
  labelKey: string;
  descriptionKey: string;
  promptKey: string;
  modelHint?: string;
};

function createPreset(
  modality: GenerationModality,
  id: string,
  modelHint?: string,
): GenerationPreset {
  return {
    id,
    modality,
    labelKey: `${modality}.${id}.label`,
    descriptionKey: `${modality}.${id}.description`,
    promptKey: `${modality}.${id}.prompt`,
    modelHint,
  };
}

export const generationPresets = {
  image: [
    createPreset("image", "editorial-cut", "flux2-klein-9b"),
    createPreset("image", "product-shadow"),
    createPreset("image", "storyboard-frame"),
  ],
  video: [
    createPreset("video", "product-orbit", "wan2-2-hf"),
    createPreset("video", "street-pan"),
    createPreset("video", "macro-motion"),
  ],
  audio: [
    createPreset("audio", "warm-voiceover", "qwen-tts"),
    createPreset("audio", "product-tagline"),
    createPreset("audio", "ambient-intro"),
  ],
} satisfies Record<GenerationModality, GenerationPreset[]>;

export function getGenerationPresets(
  modality: GenerationModality,
): GenerationPreset[] {
  return generationPresets[modality];
}
