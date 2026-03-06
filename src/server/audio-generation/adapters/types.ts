import type { AudioGenerationFormValues } from "@/features/audio-generation/model/audio-generation-schema";

export type AudioGenerationAdapterResult = {
  audios: string[];
  meta?: {
    duration_sec?: number;
  };
};

export type AudioGenerationAdapter = {
  generate: (
    payload: AudioGenerationFormValues,
  ) => Promise<AudioGenerationAdapterResult>;
  mapError?: (error: unknown) => string;
};
