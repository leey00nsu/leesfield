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
  decodeBase64DataUrl,
  GENERATION_OUTPUT_LIMITS,
  mapBoundedMediaOutputs,
  OUTBOUND_CONCURRENCY,
} from "@/server/http/bounded-io";
import { mapWithConcurrency } from "@/server/http/bounded-body";
import { uploadLeemageFile } from "@/server/shared/leemage-bounded-upload";

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
  const arrayBuffer = Uint8Array.from(buffer).buffer;
  return {
    name: leemageFileName(name),
    type: contentType,
    size: buffer.byteLength,
    arrayBuffer: async () => arrayBuffer,
  };
}

function parseDataUrl(dataUrl: string) {
  return decodeBase64DataUrl(dataUrl, {
    maxBytes: GENERATION_OUTPUT_LIMITS.video,
    invalidCode: "지원하지 않는 비디오 포맷입니다.",
    tooLargeCode: "비디오 결과가 허용된 크기를 초과했습니다.",
  });
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
  dataUrls: string[]
): Promise<VideoStorageResult> {
  const meta = await videoOutputMetadata(dataUrls);
  const client = getLeemageClient();
  const { projectId } = getLeemageConfig();

  try {
    const boundedDataUrls = await mapBoundedMediaOutputs(
      dataUrls,
      "video",
      async (dataUrl) => dataUrl,
    );
    const uploads = await mapWithConcurrency(
      boundedDataUrls,
      OUTBOUND_CONCURRENCY,
      async (dataUrl, index) => {
        const { contentType, buffer } = parseDataUrl(dataUrl);
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
    return {
      status: "completed",
      result: buildResultFromDataUrls(payload, dataUrls, meta),
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
