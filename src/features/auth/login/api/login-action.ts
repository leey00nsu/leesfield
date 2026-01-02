"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { loginSchema } from "@/features/auth/login/model/login-schema";
import { getSession } from "@/server/auth/session";

export type LoginActionState = {
  errorCode?: "INVALID_CREDENTIALS" | "SERVER_CONFIG" | "UNKNOWN";
};

const INVALID_CODE = "INVALID_CREDENTIALS" as const;
const SERVER_CONFIG_CODE = "SERVER_CONFIG" as const;
const UNKNOWN_CODE = "UNKNOWN" as const;

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const data = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = loginSchema.safeParse(data);

  if (!parsed.success) {
    return { errorCode: INVALID_CODE };
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

  if (!adminEmail || !adminPasswordHash) {
    return { errorCode: SERVER_CONFIG_CODE };
  }

  const emailMatches = parsed.data.email === adminEmail;
  let passwordMatches = false;

  try {
    passwordMatches = await bcrypt.compare(
      parsed.data.password,
      adminPasswordHash,
    );
  } catch {
    return { errorCode: UNKNOWN_CODE };
  }

  if (!emailMatches || !passwordMatches) {
    return { errorCode: INVALID_CODE };
  }

  const session = await getSession();
  session.isLoggedIn = true;
  session.adminEmail = parsed.data.email;
  await session.save();

  redirect("/");
}
