import { LeemageClient, type UploadableFile } from "@/shared/lib/leemage-sdk";
import {
  resolveVideoAspectRatioSize,
  type VideoGenerationFormValues,
} from "@/features/video-generation/model/video-generation-schema";
import type { VideoGenerationResponse } from "@/features/video-generation/model/video-generation-types";
import type {
  VideoStorageAdapter,
  VideoStorageAvailability,
  VideoStorageMeta,
  VideoStorageResult,
} from "@/server/video-generation/storage/storage-adapter";

const DEFAULT_VIDEO_META = {
  width: 640,
  height: 360,
  durationSec: 1,
};

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
      baseUrl: config.baseUrl,
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
    name,
    type: contentType,
    size: buffer.byteLength,
    arrayBuffer: async () => arrayBuffer,
  };
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match || !match[1] || !match[2]) {
    throw new Error("지원하지 않는 비디오 포맷입니다.");
  }
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  return { contentType, buffer };
}

function resolveVideoExtension(contentType: string) {
  if (contentType === "video/mp4") return "mp4";
  if (contentType === "video/webm") return "webm";
  if (contentType === "video/quicktime") return "mov";
  return "bin";
}

function resolveVideoMeta(
  payload: VideoGenerationFormValues,
  meta?: VideoStorageMeta
) {
  const fallbackSize = resolveVideoAspectRatioSize(
    payload.aspectRatio,
    payload.resolution
  );
  return {
    width: meta?.width ?? fallbackSize.width ?? DEFAULT_VIDEO_META.width,
    height: meta?.height ?? fallbackSize.height ?? DEFAULT_VIDEO_META.height,
    durationSec:
      meta?.duration_sec ??
      payload.durationSec ??
      DEFAULT_VIDEO_META.durationSec,
  };
}

function buildResultFromDataUrls(
  payload: VideoGenerationFormValues,
  dataUrls: string[],
  meta?: VideoStorageMeta
): NonNullable<VideoGenerationResponse["result"]> {
  const resolvedMeta = resolveVideoMeta(payload, meta);
  return {
    videos: dataUrls.map((url) => ({
      url,
      ...resolvedMeta,
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
  dataUrls: string[],
  meta?: VideoStorageMeta
): Promise<VideoStorageResult> {
  const client = getLeemageClient();
  const { projectId } = getLeemageConfig();

  try {
    const uploads = await Promise.all(
      dataUrls.map((dataUrl, index) => {
        const { contentType, buffer } = parseDataUrl(dataUrl);
        const extension = resolveVideoExtension(contentType);
        const name = `${requestId}-${index + 1}.${extension}`;
        const file = buildUploadFile(buffer, name, contentType);
        return client.files.upload(projectId, file);
      })
    );

    return {
      status: "completed",
      result: {
        videos: uploads.map((file) => ({
          url: resolveFileUrl(file),
          ...resolveVideoMeta(payload, meta),
        })),
      },
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
