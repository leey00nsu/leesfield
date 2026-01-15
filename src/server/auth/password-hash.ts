const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/;

export function decodeBase64UrlHash(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const decoded = Buffer.from(trimmed, "base64url").toString("utf8");
    return BCRYPT_HASH_PATTERN.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}
