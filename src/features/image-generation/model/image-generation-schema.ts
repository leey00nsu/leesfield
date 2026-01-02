import { z } from "zod";

export const aspectRatioOptions = ["1:1", "4:3", "16:9", "9:16"] as const;

export const imageGenerationSchema = z.object({
  prompt: z.string().min(1, "프롬프트를 입력해주세요."),
  negativePrompt: z.string().optional().or(z.literal("")),
  aspectRatio: z.enum(aspectRatioOptions),
  imageCount: z.number().min(1).max(8),
  cfgScale: z.number().min(1).max(20),
  steps: z.number().min(10).max(150),
  seed: z.string().optional().or(z.literal("")),
  sampler: z.string().optional().or(z.literal("")),
});

export type ImageGenerationFormValues = z.infer<typeof imageGenerationSchema>;

export const imageGenerationDefaults: ImageGenerationFormValues = {
  prompt: "",
  negativePrompt: "",
  aspectRatio: "1:1",
  imageCount: 2,
  cfgScale: 7,
  steps: 30,
  seed: "-1",
  sampler: "Euler a",
};

export const samplerOptions = [
  "Euler a",
  "DPM++ 2M Karras",
  "DPM++ SDE Karras",
  "DDIM",
] as const;

export const aspectRatioMeta = {
  "1:1": { width: 1024, height: 1024 },
  "4:3": { width: 1024, height: 768 },
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
} as const;
