export const FILE_TOO_LARGE_ERROR = "FILE_TOO_LARGE";

export async function fileToDataUrl(
  file: File,
  maxBytes?: number,
): Promise<string> {
  if (typeof maxBytes === "number" && file.size > maxBytes) {
    throw new Error(FILE_TOO_LARGE_ERROR);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

export function getNumber(formData: FormData, key: string) {
  const value = getString(formData, key);
  if (value === undefined) return undefined;
  if (value === "") return NaN;
  return Number(value);
}

export async function getDataUrlList(
  formData: FormData,
  keys: string[],
  maxBytes?: number,
) {
  const entries = keys.flatMap((key) => formData.getAll(key));
  const results: string[] = [];

  for (const entry of entries) {
    if (typeof entry === "string") {
      if (entry.trim()) {
        results.push(entry.trim());
      }
      continue;
    }
    if (entry instanceof File) {
      if (entry.size === 0) continue;
      results.push(await fileToDataUrl(entry, maxBytes));
    }
  }

  return results;
}

export async function getOptionalDataUrl(
  formData: FormData,
  key: string,
  maxBytes?: number,
) {
  const entry = formData.get(key);
  if (!entry) return undefined;
  if (typeof entry === "string") {
    return entry.trim() ? entry.trim() : "";
  }
  if (entry instanceof File) {
    if (entry.size === 0) return undefined;
    return fileToDataUrl(entry, maxBytes);
  }
  return undefined;
}
