import { loggedOperation, recordFailureLogContext, serverLogger } from "@/server/observability/logger";
import {
  LeemageClient,
  type ConfirmRequest,
  type FileResponse,
  type UploadableFile,
  type VariantOption,
} from "leemage-sdk";
import { requestRemote } from "@/server/http/safe-remote";
import { OUTBOUND_UPLOAD_TIMEOUT_MS } from "@/server/http/bounded-io";
import {
  cleanupUploadRetryAt,
  createStorageCleanupIntent,
  queueStorageCleanup,
  type MediaCleanupReason,
} from "@/server/media-assets/media-cleanup-repository";

const MAX_UPLOAD_RESPONSE_BYTES = 1024 * 1024;

type LeemageFilesClient = {
  files: Pick<LeemageClient["files"], "presign" | "confirm">
    & Partial<Pick<LeemageClient["files"], "delete">>;
};

export type UploadCleanupOptions = {
  ownerEmail?: string | null;
  requestId?: string | null;
  reason: MediaCleanupReason;
};

/**
 * Runs Leemage's presign/PUT/confirm flow with a bounded server-side PUT.
 * The SDK's high-level helper uses an unbounded native fetch for that PUT.
 */
export async function uploadLeemageFile(
  client: LeemageFilesClient,
  projectId: string,
  file: UploadableFile,
  options: { variants?: VariantOption[]; cleanup?: UploadCleanupOptions } = {},
): Promise<FileResponse> {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength !== file.size) {
    throw new Error("LEEMAGE_UPLOAD_SIZE_MISMATCH");
  }

  const context = { requestId: options.cleanup?.requestId, provider: "leemage" };
  const presigned = await loggedOperation({...context, phase:"storage.presign"}, () => client.files.presign(projectId, {
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
  }));
  let cleanupRegistered = false;
  const cleanupInput = options.cleanup
    ? {
        ownerEmail: options.cleanup.ownerEmail,
        requestId: options.cleanup.requestId,
        storageProvider: "leemage",
        storageObjectId: presigned.fileId,
        storageUrl: presigned.objectUrl,
        reason: options.cleanup.reason,
        retryAt: cleanupUploadRetryAt(new Date(), presigned.expiresAt ? new Date(presigned.expiresAt) : undefined),
      }
    : null;

  const deleteDirectly = async () => {
    await client.files.delete?.(projectId, presigned.fileId);
  };

  let phase = "storage.cleanup_register";
  try {
    if (cleanupInput) {
      await createStorageCleanupIntent(undefined, cleanupInput);
      cleanupRegistered = true;
    }
    phase = "storage.put";
    const response = await requestRemote(presigned.presignedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
        "Content-Length": String(file.size),
      },
      body: buffer,
      timeoutMs: OUTBOUND_UPLOAD_TIMEOUT_MS,
      maxBytes: MAX_UPLOAD_RESPONSE_BYTES,
      maxRedirects: 0,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`LEEMAGE_UPLOAD_HTTP_${response.status}`);
    }

    const confirm: ConfirmRequest = {
      fileId: presigned.fileId,
      objectName: presigned.objectName,
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
      ...(options.variants ? { variants: options.variants } : {}),
    };
    phase = "storage.confirm";
    const confirmed = await client.files.confirm(projectId, confirm);
    if (!confirmed.file) throw new Error("LEEMAGE_CONFIRM_INVALID");
    return confirmed.file;
  } catch (error) {
    recordFailureLogContext(error, { ...context, phase });
    serverLogger.error("storage.upload.failed", error, { ...context, phase });
    if (cleanupInput && cleanupRegistered) {
      try {
        await queueStorageCleanup(undefined, { ...cleanupInput, retryAt: new Date() });
      } catch {
        await deleteDirectly().catch(() => undefined);
      }
    } else {
      await deleteDirectly().catch(() => undefined);
    }
    throw error;
  }
}
