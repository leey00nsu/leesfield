import { z } from "zod";

type TranslationFn = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

const audioGenerationBaseSchema = z.object({
  prompt: z.string().trim().min(1, "프롬프트를 입력해주세요."),
  model: z.string().min(1),
  voice: z.string().optional().or(z.literal("")),
  speed: z.number().optional(),
  seed: z.string().optional().or(z.literal("")),
  inputAudio: z.string().optional().or(z.literal("")),
  referenceText: z.string().optional().or(z.literal("")),
  modeChoice: z.string().optional().or(z.literal("")),
  language: z.string().optional().or(z.literal("")),
  speaker: z.string().optional().or(z.literal("")),
  streamMode: z.boolean().optional(),
  referencePreset: z.string().optional().or(z.literal("")),
  customInstruction: z.string().optional().or(z.literal("")),
  voiceInstruction: z.string().optional().or(z.literal("")),
  xvecOnly: z.boolean().optional(),
  chunkSize: z.number().optional(),
  temperature: z.number().optional(),
  topK: z.number().optional(),
  repetitionPenalty: z.number().optional(),
});

export const audioGenerationOpenApiSchema = audioGenerationBaseSchema;

type AudioGenerationSchemaOptions = {
  speedRange?: {
    min: number;
    max: number;
  };
};

export const createAudioGenerationSchema = (
  t?: TranslationFn,
  options?: AudioGenerationSchemaOptions,
) => {
  const promptRequired = t ? t("promptRequired") : "프롬프트를 입력해주세요.";
  const speedLabel = t ? t("labels.speed") : "속도";
  const rangeMessage = (label: string, min: number, max: number) =>
    t
      ? t("range", { label, min, max })
      : `${label}는 ${min}~${max} 범위여야 합니다.`;

  return audioGenerationBaseSchema
    .extend({
      prompt: z.string().trim().min(1, promptRequired),
    })
    .superRefine((data, ctx) => {
      if (typeof data.speed === "number" && options?.speedRange) {
        if (
          !Number.isFinite(data.speed) ||
          data.speed < options.speedRange.min ||
          data.speed > options.speedRange.max
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["speed"],
            message: rangeMessage(
              speedLabel,
              options.speedRange.min,
              options.speedRange.max,
            ),
          });
        }
      }
    });
};

export const audioGenerationSchema = createAudioGenerationSchema();

export type AudioGenerationFormValues = z.infer<typeof audioGenerationSchema>;

export const audioGenerationDefaults: AudioGenerationFormValues = {
  prompt: "",
  model: "",
  voice: "",
  speed: 1,
  seed: "",
  inputAudio: "",
  referenceText: "",
  modeChoice: "",
  language: "",
  speaker: "",
  streamMode: false,
  referencePreset: "",
  customInstruction: "",
  voiceInstruction: "",
  xvecOnly: false,
  chunkSize: undefined,
  temperature: undefined,
  topK: undefined,
  repetitionPenalty: undefined,
};
