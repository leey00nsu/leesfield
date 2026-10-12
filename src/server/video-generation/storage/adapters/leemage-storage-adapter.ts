import { failureLogContext } from "@/server/observability/logger";
import { mediaOutputDataUrl, normalizeMediaOutputs, type MediaOutput } from "@/server/media-assets/binary-media-output";
import { logSafeError } from "@/server/observability/request-observability";
import { LeemageClient, type UploadableFile } from "leemage-sdk";
import { videoOutputMetadata } from "@/server/media-assets/video-output-metadata";
import { leemageFileName } from "@/server/shared/leemage-file-name";
import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import type { VideoGenerationResponse } from "@/features/video-generation/model/video-generation-types";
import type {
  VideoStorageAdapter,
  VideoStorageAvailability,
  VideoStorageResult,
} from "@/server/video-generation/storage/storage-adapter";
import {
  GENERATION_OUTPUT_LIMITS,
  OUTBOUND_CONCURRENCY,
} from "@/server/http/bounded-io";
import { mapWithConcurrency } from "@/server/http/bounded-body";
import { uploadLeemageFile } from "@/server/shared/leemage-bounded-upload";
import type { GeneratedMediaArtifact } from "@/server/media-assets/generated-media-artifact";

const MISSING_LEEMAGE_MESSAGE =
  "Leemage 저장소 설정이 없어 결과가 히스토리에 저장되지 않습니다.";

let cachedClient: LeemageClient | null = null;
let cachedConfig:
  | {
      apiKey: string;
      baseUrl?: string;
      projectId: string;
    }
  | null = null;

function getMissingLeemageEnv() {
  const requiredLeemageEnv = [
    ["LEEMAGE_API_KEY", process.env.LEEMAGE_API_KEY],
    ["LEEMAGE_PROJECT_ID", process.env.LEEMAGE_PROJECT_ID],
  ] as const;

  return requiredLeemageEnv
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

function checkLeemageAvailability(): VideoStorageAvailability {
  const missing = getMissingLeemageEnv();
  if (missing.length === 0) {
    return { isAvailable: true };
  }
  return { isAvailable: false, warningMessage: MISSING_LEEMAGE_MESSAGE };
}

function getLeemageConfig() {
  const missingLeemageEnv = getMissingLeemageEnv();
  if (missingLeemageEnv.length > 0) {
    throw new Error(
      `LEEMAGE 설정이 필요합니다: ${missingLeemageEnv.join(", ")}`,
    );
  }

  return {
    apiKey: process.env.LEEMAGE_API_KEY as string,
    baseUrl: process.env.LEEMAGE_BASE_URL,
    projectId: process.env.LEEMAGE_PROJECT_ID as string,
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
      baseUrl: config.baseUrl ?? "https://leemage.leey00nsu.com",
      timeout: 20_000,
    });
    cachedConfig = config;
  }

  return cachedClient;
}

function buildUploadFile(
  buffer: Buffer,
  name: string,
  contentType: string,
): UploadableFile {
  const arrayBuffer = buffer.byteOffset === 0 && buffer.byteLength === buffer.buffer.byteLength
    ? buffer.buffer as ArrayBuffer
    : Uint8Array.from(buffer).buffer;
  return {
    name: leemageFileName(name),
    type: contentType,
    size: buffer.byteLength,
    arrayBuffer: async () => arrayBuffer,
  };
}

function resolveVideoExtension(contentType: string) {
  if (contentType === "video/mp4") return "mp4";
  if (contentType === "video/webm") return "webm";
  if (contentType === "video/quicktime") return "mov";
  return "bin";
}

function resolveVideoMeta(
  meta: Awaited<ReturnType<typeof videoOutputMetadata>>["outputs"][number]
) {
  return {
    width: meta.width,
    height: meta.height,
    durationSec: meta.duration_sec,
  };
}

function buildResultFromDataUrls(
  payload: VideoGenerationFormValues,
  dataUrls: string[],
  meta: Awaited<ReturnType<typeof videoOutputMetadata>>
): NonNullable<VideoGenerationResponse["result"]> {
  return {
    videos: dataUrls.map((url, index) => ({
      url,
      ...resolveVideoMeta(meta.outputs?.[index] ?? meta),
    })),
  };
}

function resolveFileUrl(file: { url: string | null }) {
  if (!file.url) {
    throw new Error("업로드된 비디오 URL을 찾을 수 없습니다.");
  }
  return file.url;
}

async function uploadGeneratedVideos(
  payload: VideoGenerationFormValues,
  requestId: string,
  refs: MediaOutput[]
): Promise<VideoStorageResult> {
  const outputs = await normalizeMediaOutputs(refs, "video");
  const meta = await videoOutputMetadata(outputs);
  const client = getLeemageClient();
  const { projectId } = getLeemageConfig();

  try {
    const uploads = await mapWithConcurrency(
      outputs,
      OUTBOUND_CONCURRENCY,
      async ({ contentType, buffer }, index) => {
        const extension = resolveVideoExtension(contentType);
        const name = `${requestId}-${index + 1}.${extension}`;
        const file = buildUploadFile(buffer, name, contentType);
        return uploadLeemageFile(client, projectId, file, {
          cleanup: { requestId, reason: "generation_output" },
        });
      },
    );

    return {
      status: "completed",
      result: {
        videos: uploads.map((file, index) => ({
          url: resolveFileUrl(file),
          ...resolveVideoMeta(meta.outputs[index]),
        })),
      },
      artifacts: uploads.map((file, index) => {
        const resolved = resolveVideoMeta(meta.outputs[index]);
        return {
          type: "video" as const,
          storageProvider: "leemage" as const,
          storageObjectId: file.id,
          storageUrl: resolveFileUrl(file),
          mimeType: file.mimeType,
          bytes: file.size,
          width: resolved.width,
          height: resolved.height,
          durationMs: Math.round(resolved.durationSec * 1_000),
        };
      }),
    };
  } catch (error) {
    logSafeError("storage.upload.failed", error, { requestId, kind: "video", provider: "leemage", phase: failureLogContext(error)?.phase ?? "storage.upload" });
    return {
      status: "completed",
      result: buildResultFromDataUrls(payload, outputs.map(mediaOutputDataUrl), meta),
      failure: { error, phase: String(failureLogContext(error)?.phase ?? "storage.upload") },
      errorMessage:
        error instanceof Error ? error.message : "저장에 실패했습니다.",
    };
  }
}

export const leemageVideoStorageAdapter: VideoStorageAdapter = {
  name: "leemage",
  checkAvailability: checkLeemageAvailability,
  uploadVideos: uploadGeneratedVideos,
};

export async function uploadMediaOperationVideo(
  requestId: string,
  result: { buffer: Buffer; width: number; height: number; durationMs: number },
): Promise<GeneratedMediaArtifact[]> {
  if (result.buffer.byteLength > GENERATION_OUTPUT_LIMITS.video) {
    throw new Error("VIDEO_OUTPUT_TOO_LARGE");
  }
  const file = await uploadLeemageFile(
    getLeemageClient(),
    getLeemageConfig().projectId,
    buildUploadFile(result.buffer, `${requestId}.mp4`, "video/mp4"),
    { cleanup: { requestId, reason: "media_operation_output" } },
  );
  if (!file.url) throw new Error("VIDEO_OUTPUT_UPLOAD_INVALID");
  return [{
    type: "video",
    storageProvider: "leemage",
    storageObjectId: file.id,
    storageUrl: file.url,
    mimeType: "video/mp4",
    bytes: file.size,
    width: result.width,
    height: result.height,
    durationMs: result.durationMs,
  }];
}
