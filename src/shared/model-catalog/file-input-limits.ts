/** Defaults for undeclared contracts and independent operational protection. */
export const DEFAULT_FILE_INPUT_LIMIT = 8;
export const MAX_FILE_INPUT_LIMIT = 64;

/** A narrowly declared file-count hint, never an arbitrary number in a title. */
export function declaredFileCount(label: string): number | undefined {
  const match = /\((?:optional\s*,\s*)?up to (\d+)(?:\s+(?:files?|images?|videos?|audios?|references?))?\)/i.exec(label);
  if (!match) return undefined;
  const count = Number(match[1]);
  return Number.isSafeInteger(count) && count > 0 && count <= MAX_FILE_INPUT_LIMIT ? count : undefined;
}
