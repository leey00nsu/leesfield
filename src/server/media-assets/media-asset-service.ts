import { logSafeError } from "@/server/observability/request-observability";
import { mediaUploadLimits } from "@/shared/media-assets/media-upload-limits.mjs";
import { parseImageVariants } from "@/shared/media-assets/image-variants";
import { getMediaAssetName } from "@/shared/media-assets/media-asset-name";
import { getGradioContract } from "@/shared/model-catalog/gradio-contract";
import { recordObject } from "@/server/generation-request/request-snapshot";
import { historyPromptAuthoring } from "@/server/history/history-prompt-authoring";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import { encodeAssetCursor, usesAssetLibraryQuery } from "./asset-library-search";
import { ZodError } from "zod";

import { findNodeDefinition } from "@/shared/generation-graph/node-registry";
import {
  confirmMediaUploadSchema,
  createMediaOperationSchema,
  createMediaUploadSchema,
  isAllowedMediaMimeType,
  listMediaAssetsSchema,
  updateMediaOperationSchema,
  type MediaAssetDto,
  type MediaAssetListDto,
  type MediaOperationDto,
  type MediaType,
  type MediaUploadSessionDto,
} from "@/shared/media-assets/media-asset-contract";

import {
  MediaAssetInUseError,
  MediaAssetInputError,
  MediaFileTooLargeError,
  MediaAssetNotFoundError,
  MediaOperationConflictError,
  MediaQuotaExceededError,
  MediaStorageUnavailableError,
  MediaVerificationError,
} from "./media-asset-errors";
import {
  mediaAssetRepository,
  type MediaAssetRecord,
  type MediaAssetRepository,
  type MediaOperationRecord,
} from "./media-asset-repository";
import { leemageMediaStorageAdapter } from "./leemage-media-storage";
import type { MediaStorageAdapter } from "./media-storage";
import {
  BoundedIoError,
  createTimeoutSignal,
  limitReadableStream,
  OUTBOUND_UPLOAD_TIMEOUT_MS,
  readFetchResponseBytes,
} from "@/server/http/bounded-io";
import {
  cleanupUploadRetryAt,
  createStorageCleanupIntent,
  queueStorageCleanup,
  type StorageCleanupIntent,
} from "./media-cleanup-repository";

const DEFAULT_OWNER_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
export const MEDIA_CONFIRM_STEP_TIMEOUT_MS = 30_000;

async function boundedStorage<T>(work: Promise<T>, timeoutError = new MediaStorageUnavailableError()): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(timeoutError), MEDIA_CONFIRM_STEP_TIMEOUT_MS);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

function positiveEnvInteger(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function maxBytes(type: MediaType) {
  return mediaUploadLimits()[type];
}

function ownerQuotaBytes() {
  return positiveEnvInteger("MEDIA_ASSET_OWNER_QUOTA_BYTES", DEFAULT_OWNER_QUOTA_BYTES);
}

function parse<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof ZodError) throw new MediaAssetInputError(error.flatten());
    throw error;
  }
}

function normalizeMimeType(value: string) {
  const normalized = value.toLowerCase().split(";", 1)[0]?.trim() ?? "";
  if (normalized === "image/jpg") return "image/jpeg";
  if (normalized === "audio/x-wav") return "audio/wav";
  if (normalized === "audio/mp3") return "audio/mpeg";
  return normalized;
}

function mediaTypeForPort(valueType: string): MediaType | null {
  return valueType === "image" || valueType === "audio" || valueType === "video"
    ? valueType
    : null;
}

function errorCode(error: unknown) {
  return error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
    ? error.message
    : "MEDIA_UPLOAD_FAILED";
}

function assertRelayTarget(target: string, objectName: string) {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new MediaAssetInputError({ target: ["Invalid upload target"] });
  }
  const path = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (
    url.protocol !== "https:"
    || !url.hostname.endsWith(".r2.cloudflarestorage.com")
    || path !== objectName
    || !url.searchParams.has("X-Amz-Signature")
  ) {
    throw new MediaAssetInputError({ target: ["Invalid upload target"] });
  }
  return url;
}

function assertUploadOperationTarget(
  operation: MediaOperationRecord,
  input: { intendedType: MediaType; outputPortId?: string; sortOrder: number },
) {
  const definition = findNodeDefinition(operation.type);
  const output = definition?.ports.find(
    (port) => port.direction === "output" && port.id === input.outputPortId,
  );
  if (
    !definition ||
    definition.executionMode !== "browser-operation" ||
    !operation.graphNode ||
    operation.graphNode.kind !== operation.type ||
    operation.graphNode.configVersion !== operation.configVersion ||
    !["pending", "processing", "uploading"].includes(operation.status) ||
    !output ||
    mediaTypeForPort(output.valueType) !== input.intendedType ||
    input.sortOrder >= operation.expectedOutputCount ||
    (output.valueShape === "single" && input.sortOrder !== 0)
  ) {
    throw new MediaOperationConflictError("MEDIA_OPERATION_TARGET_INVALID");
  }
}

async function toAssetDto(
  asset: MediaAssetRecord,
  storage: MediaStorageAdapter,
  resolvedUrl?: string,
  inputPrompt?: string | null,
): Promise<MediaAssetDto> {
  let url: string;
  if (resolvedUrl) {
    url = resolvedUrl;
  } else if (asset.storageProvider === "legacy_url") {
    url = asset.legacyUrl ?? asset.storageUrl ?? "";
    if (!url) throw new MediaStorageUnavailableError();
  } else if (asset.storageUrl) {
    // Leemage stores permanent URLs; only old records without one need resolution.
    url = asset.storageUrl;
  } else {
    try {
      url = await storage.resolveReadUrl(asset.storageObjectId, asset.storageUrl);
    } catch (error) {
      if (error instanceof MediaStorageUnavailableError) throw error;
      throw new MediaStorageUnavailableError();
    }
  }
  return {
    imageVariants: parseImageVariants(asset.imageVariants),
    name: getMediaAssetName(asset),
    ...(inputPrompt !== undefined ? { inputPrompt } : {}),
    displayName: asset.displayName ?? null,
    classification: asset.classification as MediaAssetDto["classification"] ?? null,
    referenceId: asset.referenceId ?? null,
    displayVersion: asset.displayVersion ?? null,
    description: asset.description ?? null,
    managementStatus: asset.managementStatus as MediaAssetDto["managementStatus"] ?? null,
    originalFileName: asset.originalFileName ?? null,
    folderId: asset.folderId ?? null,
    projectIds: asset.projectMemberships?.map(({ projectId }) => projectId) ?? [],
    starred: asset.starred ?? false,
    tags: asset.tagAssignments?.map(({ tag }) => tag) ?? [],
    id: asset.id,
    version: asset.version,
    type: asset.type,
    status: asset.status,
    origin: asset.origin,
    mimeType: asset.mimeType,
    bytes: asset.bytes?.toString() ?? null,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    sourceOperationId: asset.sourceOperationId,
    url,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

function toOperationDto(operation: MediaOperationRecord): MediaOperationDto {
  return {
    id: operation.id,
    graphId: operation.graphId,
    graphNodeId: operation.graphNodeId,
    type: operation.type,
    configVersion: operation.configVersion,
    parameters: operation.parameters,
    status: operation.status,
    progress: operation.progress,
    expectedOutputCount: operation.expectedOutputCount,
    errorCode: operation.errorCode,
    outputAssetIds: operation.outputs?.map((output) => output.id) ?? [],
    outputBindings: operation.outputBindings ?? [],
    inputs: operation.inputs.map((input) => ({
      assetId: input.assetId,
      portId: input.portId,
      sortOrder: input.sortOrder,
    })),
    createdAt: operation.createdAt.toISOString(),
    updatedAt: operation.updatedAt.toISOString(),
    finishedAt: operation.finishedAt?.toISOString() ?? null,
  };
}

const cleanupLifecycle = {
  register: (input: StorageCleanupIntent) =>
    createStorageCleanupIntent(undefined, input),
  queue: (input: StorageCleanupIntent) =>
    queueStorageCleanup(undefined, input),
};

function needsAudioTextAlias(snapshot: Record<string, unknown>) {
  return typeof recordObject(snapshot.promptProvenance).connectedPrompt !== "string" && !snapshot.promptPreset
    && !(typeof snapshot.inputPrompt === "string" && snapshot.inputPrompt.length > 0)
    && typeof recordObject(snapshot.cinema).sourcePrompt !== "string";
}

function audioInputPrompt(raw: unknown, finalPrompt: string, model?: Parameters<typeof getGradioContract>[0]): string | null {
  const snapshot = recordObject(raw);
  const connected = recordObject(snapshot.promptProvenance).connectedPrompt;
  const authoring = historyPromptAuthoring(snapshot, finalPrompt).inputPrompt;
  if (typeof connected === "string") return connected;
  if (!needsAudioTextAlias(snapshot)) return authoring;

  // Native audio workflows can have one Script/Dialogue input and no canonical
  // prompt. Prefer the frozen contract and saved prompt aliases to identify that
  // input. Older snapshots use the existing model contract when it is available.
  const frozen = recordObject(snapshot.executionModel);
  let contract: ReturnType<typeof getGradioContract>;
  try { contract = getGradioContract(Object.keys(frozen).length ? frozen : model ?? {}); }
  catch { return null; }
  const canonical = contract?.inputs.find(field => field.canonical === "prompt");
  const nativeText = contract?.inputs.filter(field => field.kind === "string" && !field.hidden && !field.choices?.length && !field.name.startsWith("advanced__"));
  const aliasNames = Array.isArray(snapshot.promptFields)
    ? snapshot.promptFields.filter((name): name is string => typeof name === "string") : [];
  const aliases = canonical ? [canonical.name] : nativeText?.length === 1 ? [nativeText[0].name] : aliasNames;
  const dynamic = recordObject(snapshot.dynamicParams);
  for (const name of aliases) {
    if (typeof dynamic[name] === "string") return dynamic[name];
  }
  if (contract && !canonical) return null;
  if (!contract && Array.isArray(snapshot.promptFields) && !aliasNames.length
    && Object.values(dynamic).some(value => typeof value === "string" && value.trim())) {
    return typeof snapshot.inputPrompt === "string" ? snapshot.inputPrompt : null;
  }
  return authoring;
}

export function createMediaAssetService(
  repository: MediaAssetRepository = mediaAssetRepository,
  storage: MediaStorageAdapter = leemageMediaStorageAdapter,
  clock: () => Date = () => new Date(),
  cleanup: Pick<typeof cleanupLifecycle, "register" | "queue"> = cleanupLifecycle,
) {
  async function audioInputPrompts(ownerEmail: string, assets: readonly MediaAssetRecord[]) {
    const prompts = new Map(assets.filter(asset => asset.ownerEmail === ownerEmail && asset.type === "audio" && asset.status === "completed"
      && (asset.origin === "generation" || asset.origin === "legacy_generation")).map(asset => [asset.id, null as string | null]));
    if (!prompts.size) return prompts;
    const sources = await repository.listAudioGenerationInputs(ownerEmail, [...prompts.keys()]);
    const owned = sources.filter(source => source.assetId && prompts.has(source.assetId) && source.generation.ownerEmail === ownerEmail);
    const needsCatalog = owned.some(({ generation }) => {
      const snapshot = recordObject(generation.requestParams);
      return needsAudioTextAlias(snapshot) && generation.modelKey && !Object.keys(recordObject(snapshot.executionModel)).length
        && !(Array.isArray(snapshot.promptFields) && snapshot.promptFields.length)
        && Object.values(recordObject(snapshot.dynamicParams)).some(value => typeof value === "string");
    });
    const models = needsCatalog ? await getModelCatalog({ includeInactive: true }) : [];
    for (const source of owned) {
      if (source.assetId) {
        prompts.set(source.assetId, audioInputPrompt(source.generation.requestParams, source.generation.prompt,
          models.find(model => model.type === "audio" && model.key === source.generation.modelKey)));
      }
    }
    return prompts;
  }

  async function cleanupTerminalOperationOutputs(ownerEmail: string, operationId: string) {
    const outputs = await repository.listTerminalOperationOutputs(ownerEmail, operationId);
    await Promise.all(outputs.map(async (asset) => {
      try {
        const marked = typeof repository.markTerminalOperationOutputDeleting === "function"
          ? await repository.markTerminalOperationOutputDeleting(ownerEmail, operationId, asset.id)
          : asset;
        void marked; // The common cleanup handler owns the remote deletion.
      } catch {
        // The cleanup ledger keeps the hidden provenance row for a later retry.
      }
    }));
  }

  return {
    async createOperation(ownerEmail: string, body: unknown, options?: { transaction: import("@prisma/client").Prisma.TransactionClient; executionId: string }) {
      const input = parse(() => createMediaOperationSchema.parse(body));
      const operation = options ? await repository.createOperation(ownerEmail, input, options) : await repository.createOperation(ownerEmail, input);
      return toOperationDto(operation);
    },

    async getOperation(ownerEmail: string, operationId: string) {
      return toOperationDto(await repository.getOperation(ownerEmail, operationId));
    },

    async listNodeOperations(ownerEmail: string, graphId: string, graphNodeId: string) {
      // Polling is also the recovery entry point for abandoned confirmations.
      // Scope expiry to this owned node and never touch an unexpired upload.
      await repository.expireUploads(clock(), 100, { ownerEmail, graphId, graphNodeId });
      const operations = await repository.listNodeOperations(ownerEmail, graphId, graphNodeId, 20);
      return operations.map(toOperationDto);
    },

    async updateOperation(ownerEmail: string, operationId: string, body: unknown) {
      const input = parse(() => updateMediaOperationSchema.parse(body));
      const operation = input.status === "processing"
        ? await repository.updateOperationProgress(ownerEmail, operationId, input.progress)
        : await repository.failOperation(ownerEmail, operationId, input.errorCode);
      if (input.status === "failed") await cleanupTerminalOperationOutputs(ownerEmail, operationId);
      return toOperationDto(operation);
    },

    async cancelOperation(ownerEmail: string, operationId: string) {
      const operation = await repository.cancelOperation(ownerEmail, operationId);
      await cleanupTerminalOperationOutputs(ownerEmail, operationId);
      return toOperationDto(operation);
    },

    async createUpload(ownerEmail: string, body: unknown): Promise<MediaUploadSessionDto> {
      const input = parse(() => createMediaUploadSchema.parse(body));
      if (!isAllowedMediaMimeType(input.intendedType, input.declaredMimeType)) {
        throw new MediaVerificationError("MEDIA_MIME_MISMATCH");
      }
      const fileLimit = maxBytes(input.intendedType);
      if (input.declaredBytes > fileLimit) throw new MediaFileTooLargeError(fileLimit);
      const reserved = await repository.getOwnerReservedBytes(ownerEmail);
      if (reserved + BigInt(input.declaredBytes) > BigInt(ownerQuotaBytes())) {
        throw new MediaQuotaExceededError();
      }
      if (input.operationId) {
        const operation = await repository.getOperation(ownerEmail, input.operationId);
        assertUploadOperationTarget(operation, input);
      }

      storage.assertAvailable();
      let presign;
      try {
        presign = await boundedStorage(storage.presign({
          fileName: input.fileName,
          mimeType: input.declaredMimeType,
          bytes: input.declaredBytes,
        }), new MediaStorageUnavailableError({ stage: "presign", reason: "timeout" }));
      } catch (error) {
        logSafeError("storage.presign.failed",error,{provider:storage.name,phase:"storage.presign"});
        if (error instanceof MediaStorageUnavailableError) throw error;
        // Never retain SDK messages, response bodies, URLs or credentials in
        // route logs. A bounded status/category identifies failures safely.
        const rawStatus = error && typeof error === "object" && "status" in error ? error.status : undefined;
        const status = typeof rawStatus === "number" && Number.isInteger(rawStatus)
          && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : undefined;
        const reason = status === 401 ? "authentication" : status === 403 ? "permission"
          : status === 400 || status === 422 ? "validation" : status === 429 ? "rate_limit"
          : status ? "upstream" : error instanceof Error && error.name === "NetworkError" ? "network" : "unknown";
        throw new MediaStorageUnavailableError({ stage: "presign", reason, upstreamStatus: status });
      }
      const cleanupInput: StorageCleanupIntent = {
        ownerEmail,
        storageProvider: "leemage",
        storageObjectId: presign.objectId,
        storageUrl: presign.objectUrl,
        reason: "upload_session",
        retryAt: cleanupUploadRetryAt(clock(), presign.expiresAt),
      };
      try {
        await cleanup.register(cleanupInput);
      } catch (error) {
        await boundedStorage(storage.delete(presign.objectId)).catch(() => undefined);
        throw error;
      }
      let session;
      try {
        session = await repository.createUploadSession(
          ownerEmail,
          input,
          presign,
          BigInt(ownerQuotaBytes()),
        );
      } catch (error) {
        try {
          await cleanup.queue({ ...cleanupInput, retryAt: clock() });
        } catch {
          await boundedStorage(storage.delete(presign.objectId)).catch(() => undefined);
        }
        throw error;
      }
      return {
        id: session.id,
        intendedType: session.intendedType,
        status: session.status,
        upload: {
          method: "PUT",
          url: `/api/media-assets/uploads/${encodeURIComponent(session.id)}/content?target=${encodeURIComponent(presign.presignedUrl)}`,
          headers: { "Content-Type": session.declaredMimeType },
        },
        expiresAt: session.expiresAt.toISOString(),
      };
    },

    async relayUpload(
      ownerEmail: string,
      uploadId: string,
      target: string,
      body: ReadableStream<Uint8Array> | null,
      contentType: string | null,
      contentLength: string | null,
      requestSignal?: AbortSignal,
    ) {
      const session = await repository.getPendingUpload(ownerEmail, uploadId, clock());
      if (Number(session.declaredBytes) > maxBytes(session.intendedType)) {
        throw new MediaFileTooLargeError(maxBytes(session.intendedType));
      }
      const normalizedContentType = normalizeMimeType(contentType ?? "");
      const parsedLength = Number(contentLength);
      if (
        normalizedContentType !== normalizeMimeType(session.declaredMimeType)
        || !Number.isSafeInteger(parsedLength)
        || parsedLength !== Number(session.declaredBytes)
        || !body
      ) {
        throw new MediaVerificationError(
          normalizedContentType !== normalizeMimeType(session.declaredMimeType)
            ? "MEDIA_MIME_MISMATCH"
            : "MEDIA_SIZE_MISMATCH",
        );
      }
      const url = assertRelayTarget(target, session.storageObjectName);
      let uploadedBytes = 0;
      let completeUpload!: (bytes: number) => void;
      let failUpload!: (error: unknown) => void;
      const bodyCompleted = new Promise<number>((resolve, reject) => {
        completeUpload = resolve;
        failUpload = reject;
      });
      const boundedBody = limitReadableStream(body, {
        maxBytes: Number(session.declaredBytes),
        onBytes: (total) => {
          uploadedBytes = total;
        },
        onComplete: completeUpload,
        onError: failUpload,
      });
      const timeout = createTimeoutSignal(OUTBOUND_UPLOAD_TIMEOUT_MS, requestSignal);
      let response: Response;
      try {
        response = await fetch(url, {
          method: "PUT",
          headers: {
            "Content-Type": session.declaredMimeType,
            "Content-Length": String(session.declaredBytes),
          },
          body: boundedBody,
          duplex: "half",
          redirect: "error",
          signal: timeout.signal,
        } as RequestInit & { duplex: "half" });
        const transmitted = await Promise.race([
          bodyCompleted,
          new Promise<never>((_, reject) => {
            const timer = setTimeout(
              () => reject(new MediaStorageUnavailableError()),
              OUTBOUND_UPLOAD_TIMEOUT_MS,
            );
            bodyCompleted.finally(() => clearTimeout(timer)).catch(() => undefined);
          }),
        ]);
        if (transmitted !== Number(session.declaredBytes) || uploadedBytes !== transmitted) {
          throw new MediaVerificationError("MEDIA_SIZE_MISMATCH");
        }
        await readFetchResponseBytes(response, 1024 * 1024);
      } catch (error) {
        logSafeError("storage.relay.failed",error,{provider:storage.name,jobId:uploadId,phase:"storage.put"});
        if (error instanceof BoundedIoError) {
          throw new MediaVerificationError("MEDIA_SIZE_MISMATCH");
        }
        if (error instanceof MediaVerificationError || error instanceof MediaFileTooLargeError) throw error;
        throw new MediaStorageUnavailableError();
      } finally {
        timeout.clear();
      }
      if (!response.ok) {
        const error = new MediaStorageUnavailableError();
        logSafeError("storage.relay.failed",error,{provider:storage.name,jobId:uploadId,phase:"storage.put",status:response.status});
        throw error;
      }
    },

    async confirmUpload(ownerEmail: string, uploadId: string, body: unknown) {
      parse(() => confirmMediaUploadSchema.parse(body));
      const claim = await repository.claimUpload(ownerEmail, uploadId, clock());
      if (claim.kind === "completed") return toAssetDto(claim.asset, storage);
      const { session } = claim;

      let confirmed: Awaited<ReturnType<MediaStorageAdapter["confirm"]>>;
      let inspected: Awaited<ReturnType<MediaStorageAdapter["inspect"]>>;
      const queueFailedUpload = async (code: string) => {
        try {
          await repository.failUpload(ownerEmail, uploadId, code);
        } catch {
          // The ledger is the normal path. A direct bounded delete is the
          // emergency fallback when the database itself is unavailable.
          await boundedStorage(storage.delete(session.storageObjectId)).catch(() => undefined);
        }
      };
      let phase = "storage.confirm";
      try {
        confirmed = await boundedStorage(storage.confirm({
          objectId: session.storageObjectId,
          objectName: session.storageObjectName,
          fileName: session.storageFileName ?? session.fileName,
          mimeType: session.declaredMimeType,
          bytes: Number(session.declaredBytes),
          objectUrl: session.storageUrl,
        }));
        if (confirmed.objectId !== session.storageObjectId) {
          throw new MediaVerificationError("MEDIA_METADATA_INVALID");
        }
        if (confirmed.bytes !== Number(session.declaredBytes)) {
          throw new MediaVerificationError("MEDIA_SIZE_MISMATCH");
        }
        if (confirmed.bytes > maxBytes(session.intendedType)) {
          throw new MediaFileTooLargeError(maxBytes(session.intendedType));
        }
        const confirmedMime = normalizeMimeType(confirmed.mimeType);
        const declaredMime = normalizeMimeType(session.declaredMimeType);
        if (
          confirmedMime !== declaredMime &&
          !(session.intendedType === "audio" && declaredMime === "audio/mp4" && confirmedMime === "video/mp4")
        ) {
          throw new MediaVerificationError("MEDIA_MIME_MISMATCH");
        }
        phase = "storage.inspect";
        inspected = await boundedStorage(storage.inspect({
          url: confirmed.url,
          expectedType: session.intendedType,
          declaredMimeType: session.declaredMimeType,
        }));
        if (!isAllowedMediaMimeType(session.intendedType, inspected.detectedMimeType)) {
          throw new MediaVerificationError("MEDIA_MIME_MISMATCH");
        }
        if (session.operation?.type === "edit.video.frameGrab" && !session.operation.graphNodeId
          && (inspected.detectedMimeType !== "image/png" || inspected.isAnimated)) {
          throw new MediaVerificationError("MEDIA_MIME_MISMATCH");
        }
        if (
          (inspected.width !== null && inspected.width <= 0) ||
          (inspected.height !== null && inspected.height <= 0) ||
          (inspected.durationMs !== null && inspected.durationMs <= 0)
        ) {
          throw new MediaVerificationError("MEDIA_METADATA_INVALID");
        }
      } catch (error) {
        logSafeError("storage.confirm.failed",error,{provider:storage.name,jobId:uploadId,phase});
        await queueFailedUpload(errorCode(error));
        if (error instanceof MediaVerificationError || error instanceof MediaFileTooLargeError) throw error;
        throw new MediaStorageUnavailableError();
      }

      let asset: MediaAssetRecord;
      try {
        asset = await repository.completeUpload({
          ownerEmail,
          uploadId,
          confirmed,
          inspected,
          now: clock(),
        });
      } catch (error) {
        await queueFailedUpload(errorCode(error));
        throw error;
      }
      return toAssetDto(asset, storage, confirmed.url);
    },

    async get(ownerEmail: string, assetId: string) {
      const asset = await repository.getAsset(ownerEmail, assetId);
      const prompts = await audioInputPrompts(ownerEmail, [asset]);
      return toAssetDto(asset, storage, undefined, prompts.get(asset.id));
    },

    async list(ownerEmail: string, query: unknown): Promise<MediaAssetListDto> {
      const input = parse(() => listMediaAssetsSchema.parse(query));
      const records = await repository.listAssets(ownerEmail, input);
      const page = records.slice(0, input.limit);
      const prompts = await audioInputPrompts(ownerEmail, page);
      return {
        items: await Promise.all(page.map((asset) => toAssetDto(asset, storage, undefined, prompts.get(asset.id)))),
        nextCursor: records.length > input.limit && page.at(-1)
          ? usesAssetLibraryQuery(input) ? encodeAssetCursor(ownerEmail, input, page.at(-1)!) : page.at(-1)!.id
          : null,
      };
    },

    async remove(ownerEmail: string, assetId: string) {
      const usage = await repository.getAssetUsage(ownerEmail, assetId);
      if (usage.graphIds.length > 0 || usage.operationIds.length > 0 || usage.generationRequestIds.length > 0 || Boolean(usage.projectCoverIds?.length)) {
        throw new MediaAssetInUseError(usage.graphIds, usage.operationIds, usage.generationRequestIds, usage.projectCoverIds);
      }
      await repository.markAssetDeleting(ownerEmail, assetId);
      try {
        const racedUsage = await repository.getAssetUsage(ownerEmail, assetId);
        if (racedUsage.graphIds.length > 0 || racedUsage.operationIds.length > 0 || racedUsage.generationRequestIds.length > 0 || Boolean(racedUsage.projectCoverIds?.length)) {
          throw new MediaAssetInUseError(
            racedUsage.graphIds,
            racedUsage.operationIds,
            racedUsage.generationRequestIds,
            racedUsage.projectCoverIds,
          );
        }
        // Logical deletion is visible immediately; physical deletion is queued.
      } catch (error) {
        if (error instanceof MediaAssetInUseError) {
          await repository.restoreAsset(ownerEmail, assetId);
          throw error;
        }
        // The cleanup worker may finish the same idempotent deletion after the
        // request marked the asset deleting. The durable task already records
        // the successful remote deletion in that case.
        if (error instanceof MediaAssetNotFoundError) return;
        throw error;
      }
    },

    async reconcileExpiredUploads(limit = 100) {
      const sessions = await repository.expireUploads(clock(), limit);
      return { expiredCount: sessions.length };
    },
  };
}

export const mediaAssetService = createMediaAssetService();
