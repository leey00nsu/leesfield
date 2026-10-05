import type { LoginActionState } from "../src/features/auth/login/api/login-action";

// Preview only: keep authentication/session/DB modules out of the browser bundle.
export async function loginAction(): Promise<LoginActionState> {
  return { errorCode: "INVALID_CREDENTIALS" };
}
