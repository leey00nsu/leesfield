import { z } from "zod";

type TranslationFn = (key: string, values?: Record<string, unknown>) => string;

export const createLoginSchema = (t?: TranslationFn) =>
  z.object({
    email: z.string().email(t ? t("email") : "올바른 이메일을 입력해주세요."),
    password: z.string().min(1, t ? t("password") : "비밀번호를 입력해주세요."),
  });

export const loginSchema = createLoginSchema();

export type LoginFormValues = z.infer<typeof loginSchema>;
