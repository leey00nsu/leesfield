import { fileTypeFromBuffer } from "file-type";
import { mapWithConcurrency } from "@/server/http/bounded-body";
import { GENERATION_OUTPUT_LIMITS, OUTBOUND_CONCURRENCY } from "@/server/http/bounded-io";

export type GradioFileUploadClient = {
  config?: { root?: string; root_url?: string } | null;
  upload_files?: (root: string, files: File[]) => Promise<{ files?: string[]; error?: string }>;
};

/** The SDK resolves the deployed host; Space IDs are not DNS slugs. */
export function gradioSpaceRoot(client: GradioFileUploadClient, fallback?: string) {
  return client.config?.root || client.config?.root_url || fallback;
}

/** Upload before SDK handle_blob, which strips Blob/File names in client 2.x. */
export async function uploadGradioInputFiles(client: GradioFileUploadClient, values: Record<string, unknown>, spaceUrl?: string) {
  const blobs = new Set<Blob>();
  const collect = (value: unknown): void => {
    if (value instanceof Blob) blobs.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(values);
  if (!blobs.size) return values;
  const root = gradioSpaceRoot(client, spaceUrl);
  if (!root || !client.upload_files) throw new Error("HF_CONTRACT_FILE_UPLOAD_UNAVAILABLE");
  const uploaded = new Map<Blob, Record<string, unknown>>();
  await mapWithConcurrency([...blobs], OUTBOUND_CONCURRENCY, async blob => {
    if (blob.size > Math.max(...Object.values(GENERATION_OUTPUT_LIMITS))) throw new Error("HF_CONTRACT_FILE_TOO_LARGE");
    const buffer = Buffer.from(await blob.arrayBuffer());
    const detected = await fileTypeFromBuffer(buffer);
    const media = detected?.mime.split("/")[0];
    if (!detected || !["image", "video", "audio"].includes(media!) || (blob.type && blob.type !== detected.mime)) throw new Error("HF_CONTRACT_FILE_MEDIA");
    if (blob.size > GENERATION_OUTPUT_LIMITS[media as keyof typeof GENERATION_OUTPUT_LIMITS]) throw new Error("HF_CONTRACT_FILE_TOO_LARGE");
    const file = new File([new Uint8Array(buffer)], "reference." + detected.ext, { type: detected.mime });
    const response = await client.upload_files!(root, [file]);
    if (response.error || response.files?.length !== 1 || typeof response.files[0] !== "string" || !response.files[0].trim()) throw new Error("HF_CONTRACT_FILE_UPLOAD_FAILED");
    uploaded.set(blob, { path: response.files[0], orig_name: file.name, mime_type: file.type, size: file.size, meta: { _type: "gradio.FileData" } });
  });
  const replace = (value: unknown): unknown => {
    if (value instanceof Blob) return uploaded.get(value);
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
    return value;
  };
  return replace(values) as Record<string, unknown>;
}
