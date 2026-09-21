import {
  externalGenerationRequestSchema,
  externalFilePrefix,
} from "@/shared/api/external-contract";
import { fileToDataUrl } from "@/server/http/form-data-utils";
import {
  BodyLimitError,
  GENERATION_BODY_LIMIT_BYTES,
  mapWithConcurrency,
  readBoundedFormDataBody,
  readBoundedJsonBody,
} from "@/server/http/bounded-body";

export class ExternalRequestError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export async function readExternalGenerationRequest(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const uploads = new Map<string, File[]>();
  let body: unknown;
  if (contentType.startsWith("application/json")) {
    try {
      body = await readBoundedJsonBody(request, GENERATION_BODY_LIMIT_BYTES);
    } catch (error) {
      if (error instanceof BodyLimitError) {
        throw new ExternalRequestError(error.message, error.status);
      }
      throw new ExternalRequestError("INVALID_JSON");
    }
  } else if (contentType.startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await readBoundedFormDataBody(request, {
        maxBytes: GENERATION_BODY_LIMIT_BYTES,
        maxFiles: 8,
        maxFileBytes: 10 * 1024 * 1024,
        maxTotalFileBytes: 64 * 1024 * 1024,
      });
    } catch (error) {
      if (error instanceof BodyLimitError) {
        throw new ExternalRequestError(error.message, error.status);
      }
      throw new ExternalRequestError("INVALID_FORM_DATA");
    }
    const values: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (key.startsWith(externalFilePrefix)) {
        const name = key.slice(externalFilePrefix.length);
        if (!name || typeof value === "string" || value.size === 0)
          throw new ExternalRequestError("INVALID_FILE");
        uploads.set(name, [...(uploads.get(name) ?? []), value]);
      } else {
        if (
          !Object.hasOwn(externalGenerationRequestSchema.shape, key) ||
          Object.hasOwn(values, key) ||
          typeof value !== "string"
        )
          throw new ExternalRequestError("INVALID_FORM_DATA");
        if (key === "dynamicParams") {
          try {
            values[key] = JSON.parse(value);
          } catch {
            throw new ExternalRequestError("INVALID_JSON");
          }
        } else values[key] = value;
      }
    }
    body = values;
  } else throw new ExternalRequestError("UNSUPPORTED_MEDIA_TYPE", 415);
  return { body: externalGenerationRequestSchema.parse(body), uploads };
}
export async function resolveExternalFiles(
  values: Record<string, unknown>,
  uploads: Map<string, File[]>,
  fields: { name: string; multiple: boolean; maxBytes: number; maxItems?: number }[],
) {
  const resolved = { ...values };
  for (const [name, files] of uploads) {
    const field = fields.find((field) => field.name === name);
    if (
      !field ||
      Object.hasOwn(values, name) ||
      (!field.multiple && files.length !== 1)
    )
      throw new ExternalRequestError("INVALID_FILE_INPUT");
    if (files.some((file) => file.size > field.maxBytes))
      throw new ExternalRequestError("FILE_TOO_LARGE", 413);
    if (files.length > (field.maxItems ?? (field.multiple ? 8 : 1))) {
      throw new ExternalRequestError("TOO_MANY_FILES", 413);
    }
    // Buffer files with bounded parallelism so a multi-file request cannot
    // allocate every payload at once.
    const urls = await mapWithConcurrency(files, 2, (file) =>
      fileToDataUrl(file, field.maxBytes),
    );
    resolved[name] = field.multiple ? urls : urls[0];
  }
  return resolved;
}
