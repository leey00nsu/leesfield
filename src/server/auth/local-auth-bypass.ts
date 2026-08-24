const FALLBACK_LOCAL_ADMIN_EMAIL = "dev@localhost";

export interface LocalAuthBypass {
  adminEmail: string;
}

/**
 * Returns a synthetic local administrator only for an explicitly opted-in
 * development process. The NODE_ENV check keeps this escape hatch inert in
 * production even if the flag is accidentally present there.
 */
export function resolveLocalAuthBypass(
  env: NodeJS.ProcessEnv = process.env,
): LocalAuthBypass | null {
  if (env.NODE_ENV !== "development" || env.DEV_AUTH_BYPASS !== "true") {
    return null;
  }

  return {
    adminEmail:
      env.DEV_AUTH_BYPASS_EMAIL?.trim() ||
      env.ADMIN_EMAIL?.trim() ||
      FALLBACK_LOCAL_ADMIN_EMAIL,
  };
}
