import "./external-contract";
import { z } from "zod";
import type { GenerationMedia } from "./external-contract";
type Wire = "string" | "number" | "boolean" | "json" | "file" | "files";
export type Field = {
  schema: z.ZodType;
  wire: Wire;
  aliases?: string[];
  maxBytes?: number;
};
const string = () => ({
  schema: z.string().optional(),
  wire: "string" as const,
});
const number = () => ({
  schema: z.number().optional(),
  wire: "number" as const,
});
const boolean = () => ({
  schema: z.boolean().optional(),
  wire: "boolean" as const,
});
const common = {
  model: { schema: z.string().min(1), wire: "string" as const },
  prompt: string(),
  dynamicParams: {
    schema: z.record(z.string(), z.unknown()).optional(),
    wire: "json",
  },
  seed: string(),
} satisfies Record<string, Field>;
export const generationFields = {
  image: {
    ...common,
    width: number(),
    height: number(),
    imageCount: number(),
    steps: number(),
    modeChoice: string(),
    guidanceScale: number(),
    promptUpsampling: boolean(),
    initImages: {
      schema: z.array(z.string()).optional(),
      wire: "files",
      aliases: ["initImages[]"],
      maxBytes: 10 * 1024 * 1024,
    },
  },
  video: {
    ...common,
    aspectRatio: string(),
    resolution: number(),
    durationSec: number(),
    fps: number(),
    steps: number(),
    guidanceScale: number(),
    initImage: {
      schema: z.string().optional(),
      wire: "file",
      maxBytes: 10 * 1024 * 1024,
    },
  },
  audio: {
    ...common,
    voice: string(),
    speed: number(),
    referenceText: string(),
    modeChoice: string(),
    language: string(),
    speaker: string(),
    streamMode: boolean(),
    referencePreset: string(),
    customInstruction: string(),
    voiceInstruction: string(),
    xvecOnly: boolean(),
    chunkSize: number(),
    temperature: number(),
    topK: number(),
    repetitionPenalty: number(),
    inputAudio: { schema: z.string().optional(), wire: "file" },
  },
} satisfies Record<GenerationMedia, Record<string, Field>>;

export function generationBodySchema<M extends GenerationMedia>(media: M) {
  type Fields = (typeof generationFields)[M];
  type Shape = {
    [K in keyof Fields]: Fields[K] extends Field ? Fields[K]["schema"] : never;
  };
  return z.object(
    Object.fromEntries(
      Object.entries(generationFields[media]).map(([key, field]) => [
        key,
        field.schema,
      ]),
    ) as Shape,
  );
}

/** Routing and media envelope. Provider fields/defaults belong to the source contract. */
export function mappedGenerationBodySchema<M extends GenerationMedia>(media: M) {
  return generationBodySchema(media);
}
