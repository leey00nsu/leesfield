import { readFile } from "fs/promises";
import path from "path";
import { LeemageClient, type UploadableFile } from "@/shared/lib/leemage-sdk";
import type { VideoGenerationResponse } from "@/features/video-generation/model/video-generation-types";
import {
  resolveVideoAspectRatioSize,
  type VideoGenerationFormValues,
} from "@/features/video-generation/model/video-generation-schema";

const PLACEHOLDER_FILE = "sample-video.mp4";
const DEFAULT_VIDEO_META = {
  width: 640,
  height: 360,
  durationSec: 1,
};

type ModalVideoMeta = {
  width?: number;
  height?: number;
  duration_sec?: number;
};

const requiredLeemageEnv = [
  ["LEEMAGE_API_KEY", process.env.LEEMAGE_API_KEY],
  ["LEEMAGE_PROJECT_ID", process.env.LEEMAGE_PROJECT_ID],
  ["LEEMAGE_STORAGE_PROVIDER", process.env.LEEMAGE_STORAGE_PROVIDER],
] as const;

const missingLeemageEnv = requiredLeemageEnv
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingLeemageEnv.length > 0) {
  throw new Error(
    `LEEMAGE 설정이 필요합니다: ${missingLeemageEnv.join(", ")}`,
  );
}

const apiKey = process.env.LEEMAGE_API_KEY as string;
const baseUrl = process.env.LEEMAGE_BASE_URL;
const projectIdEnv = process.env.LEEMAGE_PROJECT_ID as string;

let cachedClient: LeemageClient | null = null;

function getLeemageClient() {
  if (!cachedClient) {
    cachedClient = new LeemageClient({
      apiKey,
      baseUrl,
      timeout: 20_000,
    });
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
  meta?: ModalVideoMeta
) {
  const fallbackSize = resolveVideoAspectRatioSize(
    payload.aspectRatio,
    payload.resolution
  );
  return {
    width: meta?.width ?? fallbackSize.width ?? DEFAULT_VIDEO_META.width,
    height: meta?.height ?? fallbackSize.height ?? DEFAULT_VIDEO_META.height,
    durationSec: meta?.duration_sec ?? payload.durationSec ?? DEFAULT_VIDEO_META.durationSec,
  };
}

function buildFallbackResult(
  payload: VideoGenerationFormValues,
  buffer: Buffer,
  contentType: string,
  meta?: ModalVideoMeta
): NonNullable<VideoGenerationResponse["result"]> {
  const base64 = buffer.toString("base64");
  const dataUrl = `data:${contentType};base64,${base64}`;
  const resolvedMeta = resolveVideoMeta(payload, meta);

  return {
    videos: [
      {
        url: dataUrl,
        ...resolvedMeta,
      },
    ],
  };
}

function buildResultFromDataUrls(
  payload: VideoGenerationFormValues,
  dataUrls: string[],
  meta?: ModalVideoMeta
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

export async function uploadGeneratedVideos(
  payload: VideoGenerationFormValues,
  requestId: string,
  dataUrls: string[],
  meta?: ModalVideoMeta
): Promise<{
  status: "completed" | "failed";
  result?: VideoGenerationResponse["result"];
  errorMessage?: string;
}> {
  const client = getLeemageClient();

  try {
    const uploads = await Promise.all(
      dataUrls.map((dataUrl, index) => {
        const { contentType, buffer } = parseDataUrl(dataUrl);
        const extension = resolveVideoExtension(contentType);
        const name = `${requestId}-${index + 1}.${extension}`;
        const file = buildUploadFile(buffer, name, contentType);
        return client.files.upload(projectIdEnv, file);
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

export async function resolveVideoGenerationResult(
  payload: VideoGenerationFormValues,
  requestId: string,
): Promise<{
  status: "completed" | "failed";
  result?: VideoGenerationResponse["result"];
  errorMessage?: string;
}> {
  const filePath = path.join(process.cwd(), "public", PLACEHOLDER_FILE);
  const buffer = await readFile(filePath);
  const contentType = "video/mp4";
  const fallbackResult = buildFallbackResult(payload, buffer, contentType);

  const client = getLeemageClient();

  try {
    const name = `${requestId}${path.extname(PLACEHOLDER_FILE)}`;
    const file = buildUploadFile(buffer, name, contentType);
    const uploaded = await client.files.upload(projectIdEnv, file);

    return {
      status: "completed",
      result: {
        videos: [
          {
            url: resolveFileUrl(uploaded),
            ...resolveVideoMeta(payload),
          },
        ],
      },
    };
  } catch (error) {
    return {
      status: "completed",
      result: fallbackResult,
      errorMessage:
        error instanceof Error ? error.message : "저장에 실패했습니다.",
    };
  }
}
