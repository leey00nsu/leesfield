import { createHash } from "node:crypto";

/** Storage-only name: never replace the user's local/display filename with this. */
export function leemageFileName(sourceName: string): string {
  const extension = sourceName.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1]?.toLowerCase() ?? "bin";
  const identity = createHash("sha256").update(sourceName).digest("hex");
  return `leesfield-${identity}.${extension}`;
}
