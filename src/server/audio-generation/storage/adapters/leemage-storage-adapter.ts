import { LeemageClient, type UploadableFile } from "leemage-sdk";
import { leemageFileName } from "@/server/shared/leemage-file-name";
import type { AudioGenerationFormValues } from "@/features/audio-generation/model/audio-generation-schema";
import type { AudioGenerationResponse } from "@/features/audio-generation/model/audio-generation-types";
import type {
  AudioStorageAdapter,
  AudioStorageAvailability,
  AudioStorageMeta,
  AudioStorageResult,
} from "@/server/audio-generation/storage/storage-adapter";
import {
  resolveAudioExtension,
  resolveAudioMime,
} from "@/shared/lib/audio-file";
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

function checkLeemageAvailability(): AudioStorageAvailability {
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
    maxBytes: GENERATION_OUTPUT_LIMITS.audio,
    invalidCode: "지원하지 않는 오디오 포맷입니다.",
    tooLargeCode: "오디오 결과가 허용된 크기를 초과했습니다.",
  });
}

function resolveDurationSec(
  payload: AudioGenerationFormValues,
  meta?: AudioStorageMeta,
) {
  if (typeof meta?.duration_sec === "number" && Number.isFinite(meta.duration_sec)) {
    return meta.duration_sec;
  }
  const fallback = payload.speed && payload.speed > 0 ? 1 / payload.speed : 1;
  return Number.isFinite(fallback) ? Math.max(0.1, Number(fallback.toFixed(2))) : 1;
}

function buildResultFromDataUrls(
  payload: AudioGenerationFormValues,
  dataUrls: string[],
  meta?: AudioStorageMeta,
): NonNullable<AudioGenerationResponse["result"]> {
  const durationSec = resolveDurationSec(payload, meta);
  return {
    audios: dataUrls.map((url) => ({
      url,
      durationSec,
    })),
  };
}

function resolveFileUrl(file: { url: string | null }) {
  if (!file.url) {
    throw new Error("업로드된 오디오 URL을 찾을 수 없습니다.");
  }
  return file.url;
}

async function uploadGeneratedAudios(
  payload: AudioGenerationFormValues,
  requestId: string,
  dataUrls: string[],
  meta?: AudioStorageMeta,
): Promise<AudioStorageResult> {
  const client = getLeemageClient();
  const { projectId } = getLeemageConfig();
  const durationSec = resolveDurationSec(payload, meta);

  try {
    const boundedDataUrls = await mapBoundedMediaOutputs(
      dataUrls,
      "audio",
      async (dataUrl) => dataUrl,
    );
    const uploads = await mapWithConcurrency(
      boundedDataUrls,
      OUTBOUND_CONCURRENCY,
      async (dataUrl, index) => {
        const { contentType, buffer } = parseDataUrl(dataUrl);
        const resolvedContentType = resolveAudioMime({ contentType, buffer });
        const extension = resolveAudioExtension(resolvedContentType);
        const name = `${requestId}-${index + 1}.${extension}`;
        const file = buildUploadFile(buffer, name, resolvedContentType);
        return uploadLeemageFile(client, projectId, file, {
          cleanup: { requestId, reason: "generation_output" },
        });
      },
    );

    return {
      status: "completed",
      result: {
        audios: uploads.map((file) => ({
          url: resolveFileUrl(file),
          durationSec,
        })),
      },
      artifacts: uploads.map((file) => ({
        type: "audio" as const,
        storageProvider: "leemage" as const,
        storageObjectId: file.id,
        storageUrl: resolveFileUrl(file),
        mimeType: file.mimeType,
        bytes: file.size,
        width: null,
        height: null,
        durationMs: Math.round(durationSec * 1_000),
      })),
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

export const leemageAudioStorageAdapter: AudioStorageAdapter = {
  name: "leemage",
  checkAvailability: checkLeemageAvailability,
  uploadAudios: uploadGeneratedAudios,
};
