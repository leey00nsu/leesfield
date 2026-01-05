import { readFile } from "fs/promises";
import path from "path";
import { LeemageClient, type UploadableFile } from "@/shared/lib/leemage-sdk";
import type { VideoGenerationResponse } from "@/features/video-generation/model/video-generation-types";
import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";

const PLACEHOLDER_FILE = "sample-video.mp4";
const DEFAULT_VIDEO_META = {
  width: 640,
  height: 360,
  durationSec: 1,
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

function buildFallbackResult(
  buffer: Buffer,
  contentType: string,
): NonNullable<VideoGenerationResponse["result"]> {
  const base64 = buffer.toString("base64");
  const dataUrl = `data:${contentType};base64,${base64}`;

  return {
    videos: [
      {
        url: dataUrl,
        ...DEFAULT_VIDEO_META,
      },
    ],
  };
}

function resolveFileUrl(file: { url: string | null }) {
  if (!file.url) {
    throw new Error("업로드된 비디오 URL을 찾을 수 없습니다.");
  }
  return file.url;
}

export async function resolveVideoGenerationResult(
  _payload: VideoGenerationFormValues,
  requestId: string,
): Promise<{
  status: "completed" | "failed";
  result?: VideoGenerationResponse["result"];
  errorMessage?: string;
}> {
  const filePath = path.join(process.cwd(), "public", PLACEHOLDER_FILE);
  const buffer = await readFile(filePath);
  const contentType = "video/mp4";
  const fallbackResult = buildFallbackResult(buffer, contentType);

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
            ...DEFAULT_VIDEO_META,
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
