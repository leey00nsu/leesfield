const DEFAULT_RETURN_TO = "/";

export function sanitizeLoginReturnTo(value: FormDataEntryValue | string | null | undefined) {
  if (typeof value !== "string") {
    return DEFAULT_RETURN_TO;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return DEFAULT_RETURN_TO;
  }

  return trimmed;
}

export function buildLoginHref(returnTo: string) {
  const safeReturnTo = sanitizeLoginReturnTo(returnTo);
  return `/login?returnTo=${encodeURIComponent(safeReturnTo)}`;
}
