import { fileTypeFromBuffer } from "file-type";
import {
  LeemageClient,
  type FileResponse,
  type UploadableFile,
} from "leemage-sdk";

import { decodeBase64DataUrl, GENERATION_OUTPUT_LIMITS } from "@/server/http/bounded-io";
import { RemoteAccessError, requestRemote } from "@/server/http/safe-remote";
import { prisma } from "@/server/db/prisma";
import { uploadLeemageFile } from "@/server/shared/leemage-bounded-upload";
import { isCleanupClient, linkStorageCleanupToAsset } from "@/server/media-assets/media-cleanup-repository";
import { leemageFileName } from "@/server/shared/leemage-file-name";
import {
  detectImageAnimation,
  imageUploadOptions,
  mapUploadedImage,
} from "@/server/media-assets/image-upload-policy";
import { mediaInspectionInternals } from "@/server/media-assets/media-inspection";
import {
  isAllowedMediaMimeType,
  type MediaType,
} from "@/shared/media-assets/media-asset-contract";
import { resolveAudioExtension, resolveAudioMime } from "@/shared/lib/audio-file";
import type { GenerationInputAssetRef } from "@/server/generation-request/generation-input-assets";
import { getGradioContract } from "@/shared/model-catalog/gradio-contract";

export const INPUT_MEDIA_STORAGE_REQUIRED = "INPUT_MEDIA_STORAGE_REQUIRED";
export const INPUT_MEDIA_INVALID = "INPUT_MEDIA_INVALID";
export const INPUT_MEDIA_FETCH_FAILED = "INPUT_MEDIA_FETCH_FAILED";
export const INPUT_MEDIA_TOO_LARGE = "INPUT_MEDIA_TOO_LARGE";

const INPUT_MEDIA_LIMITS: Record<MediaType, number> = {
  image: 10 * 1024 * 1024,
  audio: GENERATION_OUTPUT_LIMITS.audio,
  video: GENERATION_OUTPUT_LIMITS.video,
};
const INPUT_MEDIA_TIMEOUT_MS = 20_000;
const INPUT_MEDIA_MAX_COUNT = 8;
const INPUT_MEDIA_MAX_TOTAL_BYTES = 512 * 1024 * 1024;

export type InputMediaUpload = {
  field: string;
  mediaType: MediaType;
  generationType: MediaType;
  sources: readonly string[];
  multiple?: boolean;
};

export type UploadedInputMedia = {
  ref: GenerationInputAssetRef;
  url: string;
  mediaType: MediaType;
  sourceBytes?: number;
};

export class InputMediaStorageError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "InputMediaStorageError";
    this.code = code;
  }
}

type ResolvedInputMedia = {
  buffer: Buffer;
  declaredMimeType: string | null;
  sourceUrl: string | null;
};

type CatalogModel = {
  type: string;
  parameters?: unknown;
  providerConfig?: unknown;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function inputSources(value: unknown) {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isPotentialInputMediaSource(value: string) {
  return /^(data:|blob:|https?:\/\/)/i.test(value);
}

function inputMediaType(value: unknown): MediaType | null {
  return value === "image" || value === "audio" || value === "video" ? value : null;
}

/** Maps catalog file fields to the same stable field names the worker hydrates. */
export function generationInputMediaForPayload(
  generationType: MediaType,
  payload: Record<string, unknown>,
  model: CatalogModel,
): InputMediaUpload[] {
  const inputs: InputMediaUpload[] = [];
  const mappedDynamicKeys = new Set<string>();
  const add = (
    field: string,
    mediaType: MediaType,
    value: unknown,
    multiple = false,
  ) => {
    const sources = inputSources(value);
    if (sources.length === 0) return;
    if (!multiple && sources.length > 1) {
      throw new InputMediaStorageError(INPUT_MEDIA_INVALID, "INPUT_MEDIA_CARDINALITY");
    }
    if (sources.length > INPUT_MEDIA_MAX_COUNT) {
      throw new InputMediaStorageError(INPUT_MEDIA_INVALID, "INPUT_MEDIA_COUNT_LIMIT");
    }
    if (inputs.some((input) => input.field === field)) return;
    inputs.push({ field, mediaType, generationType, sources, multiple });
  };

  const dynamic = object(payload.dynamicParams);
  const contract = getGradioContract(model);
  if (contract) {
    const declaredDynamicKeys = new Set(contract.inputs.map((field) => field.name));
    const fileDynamicKeys = new Set(
      contract.inputs
        .filter((field) => ["file", "files", "gallery"].includes(field.kind))
        .map((field) => field.name),
    );
    const genericField = generationType === "audio"
      ? contract.inputs.find((field) => field.media === "audio" && ["file", "files", "gallery"].includes(field.kind))
      : contract.inputs.filter((field) => field.media === "image" && ["file", "files", "gallery"].includes(field.kind)).length === 1
        ? contract.inputs.find((field) => field.media === "image" && ["file", "files", "gallery"].includes(field.kind))
        : undefined;
    const genericValue = generationType === "image"
      ? payload.initImages
      : generationType === "video"
        ? payload.initImage
        : payload.inputAudio;
    if (inputSources(genericValue).length > 0 && !genericField) {
      throw new InputMediaStorageError(INPUT_MEDIA_INVALID, "INPUT_MEDIA_FIELD_UNRESOLVED");
    }
    for (const field of contract.inputs) {
      const mediaType = inputMediaType(field.media);
      if (!mediaType || !["file", "files", "gallery"].includes(field.kind)) continue;
      const value = Object.hasOwn(dynamic, field.name)
        ? dynamic[field.name]
        : Object.hasOwn(payload, field.name)
          ? payload[field.name]
          : genericField?.name === field.name
            ? genericValue
            : undefined;
      if (Object.hasOwn(dynamic, field.name)) mappedDynamicKeys.add(field.name);
      add(`dynamicParams.${field.name}`, mediaType, value, field.kind !== "file");
    }
    const unmappedDynamicKeys = Object.entries(dynamic)
      .filter(([, value]) => inputSources(value).some(isPotentialInputMediaSource))
      .map(([key]) => key)
      .filter((key) => !declaredDynamicKeys.has(key) || (fileDynamicKeys.has(key) && !mappedDynamicKeys.has(key)));
    if (unmappedDynamicKeys.length > 0) {
      throw new InputMediaStorageError(INPUT_MEDIA_INVALID, "INPUT_MEDIA_FIELD_UNRESOLVED");
    }
    return inputs;
  }

  if (generationType === "image") add("initImages", "image", payload.initImages, true);
  if (generationType === "video") add("initImage", "image", payload.initImage);
  if (generationType === "audio") add("inputAudio", "audio", payload.inputAudio);

  const parameterRecord = object(model.parameters);
  const fileDynamicKeys = new Set(
    Object.entries(parameterRecord)
      .filter(([, raw]) => {
        const parameter = object(raw);
        const binding = object(parameter.binding);
        const kind = typeof binding.kind === "string" ? binding.kind : parameter.ui === "upload" ? "file" : "";
        return ["file", "files", "gallery"].includes(kind);
      })
      .map(([key]) => key),
  );
  for (const [key, raw] of Object.entries(parameterRecord)) {
    const parameter = object(raw);
    const binding = object(parameter.binding);
    const mediaType = inputMediaType(binding.media) ?? inputMediaType(parameter.media);
    const kind = typeof binding.kind === "string" ? binding.kind : parameter.ui === "upload" ? "file" : "";
    if (!mediaType || !["file", "files", "gallery"].includes(kind)) continue;
    const isCanonical = typeof binding.canonicalKey === "string" &&
      ["initImages", "initImage", "inputAudio"].includes(binding.canonicalKey);
    const value = Object.hasOwn(dynamic, key) ? dynamic[key] : payload[key];
    if (Object.hasOwn(dynamic, key)) mappedDynamicKeys.add(key);
    add(isCanonical ? String(binding.canonicalKey) : `dynamicParams.${key}`, mediaType, value, kind !== "file");
  }
  const unmappedDynamicKeys = Object.entries(dynamic)
    .filter(([, value]) => inputSources(value).some(isPotentialInputMediaSource))
    .map(([key]) => key)
    .filter((key) => !Object.hasOwn(parameterRecord, key) || (fileDynamicKeys.has(key) && !mappedDynamicKeys.has(key)));
  if (unmappedDynamicKeys.length > 0) {
    throw new InputMediaStorageError(INPUT_MEDIA_INVALID, "INPUT_MEDIA_FIELD_UNRESOLVED");
  }
  return inputs;
}

let cachedClient: LeemageClient | null = null;
let cachedConfig:
  | { apiKey: string; baseUrl?: string; projectId: string }
  | null = null;

function mediaStorageProvider(type: MediaType) {
  const value = process.env[`${type.toUpperCase()}_STORAGE_PROVIDER`]
    ?.trim()
    .toLowerCase();
  if (value !== "leemage") throw new InputMediaStorageError(INPUT_MEDIA_STORAGE_REQUIRED);
}

function getLeemageConfig() {
  const apiKey = process.env.LEEMAGE_API_KEY?.trim();
  const projectId = process.env.LEEMAGE_PROJECT_ID?.trim();
  if (!apiKey || !projectId) {
    throw new InputMediaStorageError(INPUT_MEDIA_STORAGE_REQUIRED);
  }
  return {
    apiKey,
    projectId,
    baseUrl: process.env.LEEMAGE_BASE_URL?.trim() || "https://leemage.leey00nsu.com",
  };
}

function getLeemageClient() {
  const config = getLeemageConfig();
  if (
    !cachedClient ||
    !cachedConfig ||
    cachedConfig.apiKey !== config.apiKey ||
    cachedConfig.baseUrl !== config.baseUrl ||
    cachedConfig.projectId !== config.projectId
  ) {
    cachedClient = new LeemageClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeout: INPUT_MEDIA_TIMEOUT_MS,
      allowInsecureHttp:
        process.env.NODE_ENV !== "production" && config.baseUrl.startsWith("http://"),
    });
    cachedConfig = config;
  }
  return cachedClient;
}

function normalizeMime(value: string | null | undefined) {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (normalized === "image/jpg") return "image/jpeg";
  if (normalized === "audio/x-wav") return "audio/wav";
  if (normalized === "audio/mp3") return "audio/mpeg";
  return normalized;
}

function extensionFor(type: MediaType, mimeType: string) {
  if (type === "audio") return resolveAudioExtension(mimeType);
  const extensions: Record<string, string> = {
    "image/avif": "avif",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
  };
  return extensions[mimeType] ?? "bin";
}

function buildUploadFile(buffer: Buffer, name: string, mimeType: string): UploadableFile {
  const arrayBuffer = Uint8Array.from(buffer).buffer;
  return {
    name: leemageFileName(name),
    type: mimeType,
    size: buffer.byteLength,
    arrayBuffer: async () => arrayBuffer,
  };
}

function uploadedUrl(file: FileResponse) {
  const url = file.url ?? file.variants?.find((variant) => variant.url)?.url;
  if (!url) throw new InputMediaStorageError(INPUT_MEDIA_STORAGE_REQUIRED, "INPUT_MEDIA_URL_MISSING");
  return url;
}

async function resolveSource(
  source: string,
  type: MediaType,
  remainingBytes: number = INPUT_MEDIA_MAX_TOTAL_BYTES,
): Promise<ResolvedInputMedia> {
  const maxBytes = Math.min(INPUT_MEDIA_LIMITS[type], remainingBytes);
  if (source.startsWith("data:")) {
    try {
      const decoded = decodeBase64DataUrl(source, {
        maxBytes,
        invalidCode: INPUT_MEDIA_INVALID,
        tooLargeCode: INPUT_MEDIA_TOO_LARGE,
      });
      return {
        buffer: decoded.buffer,
        declaredMimeType: normalizeMime(decoded.contentType),
        sourceUrl: null,
      };
    } catch (error) {
      if (error instanceof Error && error.message === INPUT_MEDIA_TOO_LARGE) throw error;
      throw new InputMediaStorageError(INPUT_MEDIA_INVALID);
    }
  }

  try {
    const response = await requestRemote(source, {
      timeoutMs: INPUT_MEDIA_TIMEOUT_MS,
      maxBytes,
      maxRedirects: 3,
      allowInsecureHttp: true,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new InputMediaStorageError(INPUT_MEDIA_FETCH_FAILED);
    }
    return {
      buffer: response.body,
      declaredMimeType: normalizeMime(response.headers["content-type"]),
      sourceUrl: source,
    };
  } catch (error) {
    if (error instanceof InputMediaStorageError) throw error;
    if (error instanceof RemoteAccessError && error.code === "REMOTE_TOO_LARGE") {
      throw new InputMediaStorageError(INPUT_MEDIA_TOO_LARGE);
    }
    throw new InputMediaStorageError(INPUT_MEDIA_FETCH_FAILED);
  }
}

async function detectMime(
  type: MediaType,
  resolved: ResolvedInputMedia,
) {
  const detected = await fileTypeFromBuffer(resolved.buffer);
  let mimeType = normalizeMime(detected?.mime);
  if (!mimeType && type === "audio") {
    mimeType = normalizeMime(resolveAudioMime({ buffer: resolved.buffer }));
  }
  if (
    type === "audio" &&
    resolved.declaredMimeType === "audio/mp4" &&
    mimeType === "video/mp4"
  ) {
    mimeType = "audio/mp4";
  }
  if (!mimeType || !isAllowedMediaMimeType(type, mimeType)) {
    throw new InputMediaStorageError(INPUT_MEDIA_INVALID);
  }
  return mimeType;
}

function mediaMetadata(type: MediaType, buffer: Buffer, mimeType: string) {
  const dimensions = type === "image"
    ? mediaInspectionInternals.imageDimensions(buffer, mimeType)
    : null;
  return {
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    durationMs: mediaInspectionInternals.durationMs(buffer, mimeType),
    imageVariants: type === "image"
      ? { isAnimated: detectImageAnimation(buffer, mimeType) }
      : undefined,
  };
}

async function uploadOne(
  requestId: string,
  ownerEmail: string,
  input: InputMediaUpload,
  source: string,
  sortOrder: number,
  remainingBytes: number,
) {
  mediaStorageProvider(input.mediaType);
  const resolved = await resolveSource(source, input.mediaType, remainingBytes);
  const mimeType = await detectMime(input.mediaType, resolved);
  const client = getLeemageClient();
  const { projectId } = getLeemageConfig();
  const extension = extensionFor(input.mediaType, mimeType);
  const name = `${requestId}-${input.field.replace(/[^a-zA-Z0-9_-]+/g, "-")}-${sortOrder + 1}.${extension}`;
  const confirmed = await uploadLeemageFile(
    client,
    projectId,
    buildUploadFile(resolved.buffer, name, mimeType),
    {
      ...(input.mediaType === "image" ? imageUploadOptions(mimeType) : {}),
      cleanup: {
        ownerEmail,
        requestId,
        reason: "generation_input",
      },
    },
  );
  const fallbackUrl = uploadedUrl(confirmed);
  const metadata = mediaMetadata(input.mediaType, resolved.buffer, mimeType);
  const image = input.mediaType === "image"
    ? mapUploadedImage(confirmed, {
        url: fallbackUrl,
        width: metadata.width,
        height: metadata.height,
        isAnimated: metadata.imageVariants?.isAnimated,
      })
    : null;
  const asset = await prisma.$transaction(async (tx) => {
    const created = await tx.mediaAsset.create({
      data: {
        ownerEmail,
        type: input.mediaType,
        origin: "upload",
        storageProvider: "leemage",
        storageObjectId: confirmed.id,
        storageUrl: image?.url ?? fallbackUrl,
        legacyUrl: null,
        mimeType,
        bytes: BigInt(resolved.buffer.byteLength),
        width: image?.width ?? metadata.width,
        height: image?.height ?? metadata.height,
        durationMs: metadata.durationMs,
        ...(image?.imageVariants ? { imageVariants: image.imageVariants } : {}),
      },
      select: { id: true },
    });
    if (isCleanupClient(tx)) {
      await linkStorageCleanupToAsset(tx, {
        ownerEmail,
        requestId,
        storageProvider: "leemage",
        storageObjectId: confirmed.id,
        storageUrl: image?.url ?? fallbackUrl,
        reason: "generation_input",
        assetId: created.id,
      });
    }
    return created;
  });
  return {
    ref: {
      assetId: asset.id,
      field: input.field,
      sortOrder,
      multiple: input.multiple === true,
      generationType: input.generationType,
    },
    url: image?.url ?? fallbackUrl,
    mediaType: input.mediaType,
    sourceBytes: resolved.buffer.byteLength,
  } satisfies UploadedInputMedia;
}

/** Stores generation inputs once and returns only durable URLs plus asset IDs. */
export async function uploadGenerationInputAssets(
  requestId: string,
  ownerEmail: string,
  inputs: readonly InputMediaUpload[],
): Promise<UploadedInputMedia[]> {
  const jobs = inputs.flatMap((input) =>
    input.sources
      .map((source) => source.trim())
      .filter(Boolean)
      .map((source, index) => ({ input, source, sortOrder: index })),
  );
  if (jobs.length === 0) return [];
  if (jobs.length > INPUT_MEDIA_MAX_COUNT) {
    throw new InputMediaStorageError(INPUT_MEDIA_INVALID, "INPUT_MEDIA_COUNT_LIMIT");
  }
  const uploaded: UploadedInputMedia[] = [];
  let totalBytes = 0;
  for (const job of jobs) {
    const item = await uploadOne(
      requestId,
      ownerEmail,
      job.input,
      job.source,
      job.sortOrder,
      INPUT_MEDIA_MAX_TOTAL_BYTES - totalBytes,
    );
    totalBytes += item.sourceBytes ?? 0;
    if (totalBytes > INPUT_MEDIA_MAX_TOTAL_BYTES) {
      throw new InputMediaStorageError(INPUT_MEDIA_TOO_LARGE);
    }
    uploaded.push(item);
  }
  return uploaded;
}

/** Replaces file inputs with their storage URLs before the generation row is built. */
export function applyUploadedGenerationInputAssets<T extends Record<string, unknown>>(
  payload: T,
  uploaded: readonly UploadedInputMedia[],
): T {
  if (uploaded.length === 0) return payload;
  const result = { ...payload } as Record<string, unknown>;
  const dynamic = { ...object(payload.dynamicParams) };
  const grouped = new Map<string, UploadedInputMedia[]>();
  for (const item of uploaded) {
    const values = grouped.get(item.ref.field) ?? [];
    values.push(item);
    grouped.set(item.ref.field, values);
  }
  for (const [field, values] of grouped) {
    values.sort((left, right) => left.ref.sortOrder - right.ref.sortOrder);
    const urls = values.map((value) => value.url);
    if (field === "initImages") result.initImages = urls;
    else if (field === "initImage") result.initImage = urls[0] ?? "";
    else if (field === "inputAudio") result.inputAudio = urls[0] ?? "";
    else if (field.startsWith("dynamicParams.")) {
      const key = field.slice("dynamicParams.".length);
      if (key) dynamic[key] = values[0]?.ref.multiple ? urls : urls[0] ?? "";
    }
  }
  const uploadedMediaTypes = new Set(uploaded.map((item) => item.mediaType));
  const uploadedGenerationTypes = new Set(
    uploaded
      .map((item) => item.ref.generationType)
      .filter((value): value is MediaType => inputMediaType(value) !== null),
  );
  const uploadedFields = new Set(uploaded.map((item) => item.ref.field));
  if (uploadedGenerationTypes.has("image") && uploadedMediaTypes.has("image") && !uploadedFields.has("initImages")) {
    result.initImages = [];
  }
  if (uploadedGenerationTypes.has("video") && uploadedMediaTypes.has("image") && !uploadedFields.has("initImage")) {
    result.initImage = "";
  }
  if (uploadedGenerationTypes.has("audio") && uploadedMediaTypes.has("audio") && !uploadedFields.has("inputAudio")) {
    result.inputAudio = "";
  }
  if (Object.keys(dynamic).length > 0 || payload.dynamicParams !== undefined) {
    result.dynamicParams = dynamic;
  }
  return result as T;
}

export function resolveInputMediaErrorCode(error: unknown) {
  if (error instanceof InputMediaStorageError) return error.code;
  if (error instanceof Error && error.message) return error.message;
  return null;
}
