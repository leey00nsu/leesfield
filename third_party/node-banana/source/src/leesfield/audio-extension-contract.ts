export type LeesfieldAudioEditParameters = {
  startMs: number;
  endMs: number;
  offsetMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  outputMimeType: "audio/wav";
};

export type LeesfieldAudioGalleryItem = {
  assetId: string;
  durationMs: number | null;
  downloadName: string;
};

export const LEESFIELD_AUDIO_EXTENSION_VERSION = 1 as const;

