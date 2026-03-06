import { z } from "zod";

type TranslationFn = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

const audioGenerationBaseSchema = z.object({
  prompt: z.string().min(1, "프롬프트를 입력해주세요."),
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

export const createAudioGenerationSchema = (t?: TranslationFn) => {
  const promptRequired = t ? t("promptRequired") : "프롬프트를 입력해주세요.";
  const speedLabel = t ? t("labels.speed") : "속도";
  const rangeMessage = (label: string, min: number, max: number) =>
    t
      ? t("range", { label, min, max })
      : `${label}는 ${min}~${max} 범위여야 합니다.`;

  return audioGenerationBaseSchema
    .extend({
      prompt: z.string().min(1, promptRequired),
    })
    .superRefine((data, ctx) => {
      if (typeof data.speed === "number") {
        if (!Number.isFinite(data.speed) || data.speed < 0.25 || data.speed > 4) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["speed"],
            message: rangeMessage(speedLabel, 0.25, 4),
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
};
