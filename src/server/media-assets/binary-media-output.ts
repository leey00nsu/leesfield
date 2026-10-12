import { fileTypeFromBuffer } from "file-type";
import {
  assertOutputCount, decodeBase64DataUrl, GENERATION_OUTPUT_LIMITS,
  GENERATION_OUTPUT_MAX_TOTAL_BYTES, type GenerationMediaType,
} from "@/server/http/bounded-io";

/** Internal transport only. Public responses continue to contain URLs. */
export type BinaryMediaOutput = { buffer: Buffer; contentType: string };
export type MediaOutput = string | BinaryMediaOutput;

export class MediaOutputError extends Error {
  constructor(
    public readonly code: string,
    public readonly phase: string,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "MediaOutputError";
  }
}

export function mediaOutputDataUrl(output: MediaOutput): string {
  return typeof output === "string" ? output
    : "data:" + output.contentType + ";base64," + output.buffer.toString("base64");
}

export async function normalizeMediaOutputs(
  refs: MediaOutput[], media: GenerationMediaType,
): Promise<BinaryMediaOutput[]> {
  try {
    assertOutputCount(media, refs.length);
    let total = 0;
    const outputs: BinaryMediaOutput[] = [];
    for (const ref of refs) {
      const limit = Math.min(GENERATION_OUTPUT_LIMITS[media], GENERATION_OUTPUT_MAX_TOTAL_BYTES - total);
      if (limit <= 0) throw new Error("GENERATION_OUTPUT_TOTAL_LIMIT");
      const output = typeof ref === "string"
        ? decodeBase64DataUrl(ref, {
          maxBytes: limit, invalidCode: "GENERATION_" + media.toUpperCase() + "_OUTPUT_INVALID",
          tooLargeCode: "GENERATION_" + media.toUpperCase() + "_OUTPUT_TOO_LARGE",
        }) : ref;
      if (!Buffer.isBuffer(output.buffer) || !output.buffer.length)
        throw new Error("GENERATION_" + media.toUpperCase() + "_OUTPUT_INVALID");
      if (output.buffer.length > limit)
        throw new Error("GENERATION_" + media.toUpperCase() + "_OUTPUT_TOO_LARGE");
      const file = await fileTypeFromBuffer(output.buffer);
      if (!file || file.mime !== output.contentType || !file.mime.startsWith(media + "/"))
        throw new Error("GENERATION_" + media.toUpperCase() + "_OUTPUT_INVALID");
      total += output.buffer.length;
      outputs.push(output);
    }
    return outputs;
  } catch (error) {
    if (error instanceof MediaOutputError) throw error;
    const code = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
      ? error.message : "GENERATION_" + media.toUpperCase() + "_OUTPUT_INVALID";
    throw new MediaOutputError(code, "result.decode", { cause: error });
  }
}

/** Bound each download by the remaining batch budget before allocating bytes. */
export async function mapBoundedBinaryOutputs<T>(
  refs: T[], media: GenerationMediaType,
  mapper: (ref: T, index: number, maxBytes: number) => Promise<BinaryMediaOutput>,
) {
  assertOutputCount(media, refs.length);
  const outputs: BinaryMediaOutput[] = [];
  let total = 0;
  for (const [index, ref] of refs.entries()) {
    const maxBytes = Math.min(GENERATION_OUTPUT_LIMITS[media], GENERATION_OUTPUT_MAX_TOTAL_BYTES - total);
    if (maxBytes <= 0) throw new MediaOutputError("GENERATION_OUTPUT_TOTAL_LIMIT", "result.download");
    const output = await mapper(ref, index, maxBytes);
    if (!Buffer.isBuffer(output.buffer) || !output.buffer.length)
      throw new MediaOutputError("GENERATION_" + media.toUpperCase() + "_OUTPUT_INVALID", "result.download");
    if (output.buffer.length > maxBytes)
      throw new MediaOutputError("GENERATION_" + media.toUpperCase() + "_OUTPUT_TOO_LARGE", "result.download");
    total += output.buffer.length;
    outputs.push(output);
  }
  return outputs;
}
