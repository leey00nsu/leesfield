import { z } from "zod";

export const videoGenerationModes = ["text", "image"] as const;

export const videoGenerationSchema = z
  .object({
    mode: z.enum(videoGenerationModes),
    prompt: z.string().min(1, "프롬프트를 입력해주세요."),
    initImage: z.string().optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.mode === "image" && !data.initImage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["initImage"],
        message: "이미지를 업로드해주세요.",
      });
    }
  });

export type VideoGenerationFormValues = z.infer<
  typeof videoGenerationSchema
>;

export const videoGenerationDefaults: VideoGenerationFormValues = {
  mode: "text",
  prompt: "",
  initImage: "",
};
