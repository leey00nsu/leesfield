import { readFile } from "fs/promises";
import path from "path";
import { LeemageClient, type UploadableFile } from "@/shared/lib/leemage-sdk";
import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { ImageGenerationResponse } from "@/features/image-generation/model/image-generation-types";
import type {
  ImageStorageAdapter,
  ImageStorageAvailability,
  ImageStorageResult,
} from "@/server/image-generation/storage/storage-adapter";

const PLACEHOLDER_FILE = "sample-image.png";
const DEFAULT_VARIANTS = [{ sizeLabel: "source", format: "webp" }] as const;
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

function checkLeemageAvailability(): ImageStorageAvailability {
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

function resolveContentType(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function resolveExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/jpeg") return "jpg";
  return "bin";
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match || !match[1] || !match[2]) {
    throw new Error("지원하지 않는 이미지 포맷입니다.");
  }
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  return { contentType, buffer };
}

function buildUploadFile(buffer: Buffer, name: string): UploadableFile {
  const arrayBuffer = Uint8Array.from(buffer).buffer;

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
  contentType: string
): NonNullable<ImageGenerationResponse["result"]> {
  const base64 = buffer.toString("base64");
  const dataUrl = `data:${contentType};base64,${base64}`;
  const { width, height } = payload;

  return {
    images: Array.from({ length: payload.imageCount }, () => ({
      url: dataUrl,
      width,
      height,
    })),
  };
}

function buildResultFromDataUrls(
  payload: ImageGenerationFormValues,
  dataUrls: string[]
): NonNullable<ImageGenerationResponse["result"]> {
  const { width, height } = payload;
  return {
    images: dataUrls.map((url) => ({
      url,
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
  fallbackHeight: number
) {
  const variant = file.variants.find((item) => item.url) ?? file.variants[0];
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

export async function uploadGeneratedImages(
  payload: ImageGenerationFormValues,
  requestId: string,
  dataUrls: string[]
): Promise<ImageStorageResult> {
  const client = getLeemageClient();
  const { projectId } = getLeemageConfig();
  const { width, height } = payload;

  try {
    const uploads = await Promise.all(
      dataUrls.map((dataUrl, index) => {
        const { contentType, buffer } = parseDataUrl(dataUrl);
        const extension = resolveExtension(contentType);
        const name = `${requestId}-${index + 1}.${extension}`;
        const file = buildUploadFile(buffer, name);
        return client.files.upload(projectId, file, {
          variants: [...DEFAULT_VARIANTS],
        });
      })
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
      result: buildResultFromDataUrls(payload, dataUrls),
      errorMessage:
        error instanceof Error ? error.message : "저장에 실패했습니다.",
    };
  }
}

export async function resolveGenerationResult(
  payload: ImageGenerationFormValues,
  requestId: string
): Promise<ImageStorageResult> {
  const filePath = path.join(process.cwd(), "public", PLACEHOLDER_FILE);
  const buffer = await readFile(filePath);
  const contentType = resolveContentType(PLACEHOLDER_FILE);
  const fallbackResult = buildFallbackResult(payload, buffer, contentType);

  const client = getLeemageClient();
  const { projectId } = getLeemageConfig();

  try {
    const { width, height } = payload;
    const uploads = await Promise.all(
      Array.from({ length: payload.imageCount }, (_, index) => {
        const name = `${requestId}-${index + 1}${path.extname(
          PLACEHOLDER_FILE
        )}`;
        const file = buildUploadFile(buffer, name);
        return client.files.upload(projectId, file, {
          variants: [...DEFAULT_VARIANTS],
        });
      })
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
        error instanceof Error ? error.message : "저장에 실패했습니다.",
    };
  }
}

export const leemageStorageAdapter: ImageStorageAdapter = {
  name: "leemage",
  checkAvailability: checkLeemageAvailability,
  uploadImages: uploadGeneratedImages,
};
