"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";

export async function logoutAction() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
