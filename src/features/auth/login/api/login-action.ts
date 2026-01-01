"use server";

import { redirect } from "next/navigation";
import { loginSchema } from "@/features/auth/login/model/login-schema";
import { getSession } from "@/server/auth/session";

export type LoginActionState = {
  error?: string;
};

const INVALID_MESSAGE = "이메일 또는 비밀번호가 올바르지 않습니다.";
const SERVER_CONFIG_MESSAGE = "서버 설정이 필요합니다.";

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const data = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = loginSchema.safeParse(data);

  if (!parsed.success) {
    return { error: INVALID_MESSAGE };
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    return { error: SERVER_CONFIG_MESSAGE };
  }

  if (
    parsed.data.email !== adminEmail ||
    parsed.data.password !== adminPassword
  ) {
    return { error: INVALID_MESSAGE };
  }

  const session = await getSession();
  session.isLoggedIn = true;
  session.adminEmail = parsed.data.email;
  await session.save();

  redirect("/");
}
