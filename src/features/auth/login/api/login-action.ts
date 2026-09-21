"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { sanitizeLoginReturnTo } from "@/features/auth/lib/login-redirect";
import { loginSchema } from "@/features/auth/login/model/login-schema";
import { decodeBase64UrlHash } from "@/server/auth/password-hash";
import { getSession } from "@/server/auth/session";
import { headers } from "next/headers";
import { withBcryptSlot } from "@/server/auth/bcrypt-gate";
import { resolveClientSubject } from "@/server/http/client-ip";
import { enforceRateLimit } from "@/server/rate-limit/enforce";
import { RATE_LIMITS } from "@/server/rate-limit/policies";

export interface LoginActionState {
  errorCode?:
    | "INVALID_CREDENTIALS"
    | "SERVER_CONFIG"
    | "UNKNOWN"
    | "RATE_LIMITED";
}

const INVALID_CODE = "INVALID_CREDENTIALS" as const;
const SERVER_CONFIG_CODE = "SERVER_CONFIG" as const;
const UNKNOWN_CODE = "UNKNOWN" as const;
const RATE_LIMITED_CODE = "RATE_LIMITED" as const;

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const data = {
    email: formData.get("email"),
    password: formData.get("password"),
  };
  const returnTo = sanitizeLoginReturnTo(formData.get("returnTo"));

  const parsed = loginSchema.safeParse(data);

  if (!parsed.success) {
    return { errorCode: INVALID_CODE };
  }

  // Bounded before the expensive credential compare so a login burst cannot
  // pin the process on bcrypt work. Rejections reuse the form error channel.
  const clientLimited = await enforceRateLimit(
    RATE_LIMITS.loginIp,
    resolveClientSubject({ headers: await headers() }),
  );
  if (clientLimited) return { errorCode: RATE_LIMITED_CODE };

  const accountLimited = await enforceRateLimit(
    RATE_LIMITS.loginAccount,
    parsed.data.email,
  );
  if (accountLimited) return { errorCode: RATE_LIMITED_CODE };

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

  const decodedHash = adminPasswordHash
    ? decodeBase64UrlHash(adminPasswordHash)
    : null;

  if (!adminEmail || !decodedHash) {
    return { errorCode: SERVER_CONFIG_CODE };
  }

  const emailMatches = parsed.data.email === adminEmail;
  let passwordMatches = false;

  try {
    passwordMatches = await withBcryptSlot(() =>
      bcrypt.compare(parsed.data.password, decodedHash),
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

  redirect(returnTo);
}
