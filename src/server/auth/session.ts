import { cache } from "react";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

import { resolveLocalAuthBypass } from "./local-auth-bypass";
import { getServerEnv } from "@/server/runtime/env";

export interface SessionData {
  isLoggedIn: boolean;
  adminEmail?: string;
}

const serverEnv = getServerEnv();
const sessionPassword = serverEnv.sessionPassword;

export const sessionOptions = {
  password: sessionPassword,
  cookieName: "leesfield_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: serverEnv.isProduction,
  },
};

export const getSession = cache(async function getSession() {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(
    cookieStore,
    sessionOptions,
  );
  const localAuthBypass = resolveLocalAuthBypass();

  if (localAuthBypass) {
    session.isLoggedIn = true;
    session.adminEmail = localAuthBypass.adminEmail;
  }

  return session;
});
