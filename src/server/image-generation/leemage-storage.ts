import { readFile } from "fs/promises";
import path from "path";
import { LeemageClient, type UploadableFile } from "@/shared/lib/leemage-sdk";
import {
  aspectRatioMeta,
  type ImageGenerationFormValues,
} from "@/features/image-generation/model/image-generation-schema";
import type { ImageGenerationResponse } from "@/features/image-generation/model/image-generation-types";

const PLACEHOLDER_FILE = "sample-image.png";
const DEFAULT_VARIANTS = [{ sizeLabel: "max800", format: "webp" }] as const;

const apiKey = process.env.LEEMAGE_API_KEY ?? "";
const projectId = process.env.LEEMAGE_PROJECT_ID ?? "";
const baseUrl = process.env.LEEMAGE_BASE_URL;

let cachedClient: LeemageClient | null = null;

function getLeemageClient() {
  if (!apiKey) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = new LeemageClient({
      apiKey,
      baseUrl,
      timeout: 20_000,
    });
  }

  return cachedClient;
}

function resolveContentType(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function buildUploadFile(buffer: Buffer, name: string): UploadableFile {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );

  return {
    name,
    type: resolveContentType(name),
    size: buffer.byteLength,
    arrayBuffer: async () => arrayBuffer,
  };
}

function buildFallbackResult(
  payload: ImageGenerationFormValues,
  buffer: Buffer,
  contentType: string,
): NonNullable<ImageGenerationResponse["result"]> {
  const base64 = buffer.toString("base64");
  const dataUrl = `data:${contentType};base64,${base64}`;
  const { width, height } = aspectRatioMeta[payload.aspectRatio];

  return {
    images: Array.from({ length: payload.imageCount }, () => ({
      url: dataUrl,
      width,
      height,
    })),
  };
}

function mapFileToImage(
  file: {
    url: string | null;
    variants: Array<{ url: string; width: number; height: number }>;
  },
  fallbackWidth: number,
  fallbackHeight: number,
) {
  const variant =
    file.variants.find((item) => item.url) ?? file.variants[0];
  const url = variant?.url ?? file.url;

  if (!url) {
    throw new Error("업로드된 이미지 URL을 찾을 수 없습니다.");
  }

  return {
    url,
    width: variant?.width ?? fallbackWidth,
    height: variant?.height ?? fallbackHeight,
  };
}

export async function resolveGenerationResult(
  payload: ImageGenerationFormValues,
): Promise<{
  status: "completed" | "failed";
  result?: ImageGenerationResponse["result"];
  errorMessage?: string;
}> {
  const filePath = path.join(process.cwd(), "public", PLACEHOLDER_FILE);
  const buffer = await readFile(filePath);
  const contentType = resolveContentType(PLACEHOLDER_FILE);
  const fallbackResult = buildFallbackResult(payload, buffer, contentType);

  const client = getLeemageClient();
  if (!client || !projectId) {
    return {
      status: "completed",
      result: fallbackResult,
      errorMessage: "LEEMAGE 설정이 필요합니다.",
    };
  }

  try {
    const { width, height } = aspectRatioMeta[payload.aspectRatio];
    const uploads = await Promise.all(
      Array.from({ length: payload.imageCount }, (_, index) => {
        const name = `generated-${payload.aspectRatio}-${index + 1}${path.extname(PLACEHOLDER_FILE)}`;
        const file = buildUploadFile(buffer, name);
        return client.files.upload(projectId, file, {
          variants: [...DEFAULT_VARIANTS],
        });
      }),
    );

    return {
      status: "completed",
      result: {
        images: uploads.map((file) => mapFileToImage(file, width, height)),
      },
    };
  } catch (error) {
    return {
      status: "completed",
      result: fallbackResult,
      errorMessage:
        error instanceof Error
          ? error.message
          : "저장에 실패했습니다.",
    };
  }
}
