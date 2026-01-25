import { LeemageClient, type UploadableFile } from "@/shared/lib/leemage-sdk";
import { resolveImageStorageProvider } from "@/server/image-generation/storage/storage-selector";

export const INPUT_IMAGE_STORAGE_REQUIRED = "IMAGE_INPUT_STORAGE_REQUIRED";
export const INPUT_IMAGE_INVALID = "INPUT_IMAGE_INVALID";

const DEFAULT_VARIANTS = [{ sizeLabel: "source", format: "webp" }] as const;
const FETCH_TIMEOUT_MS = 20_000;

export class InputImageStorageError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

type ImageBuffer = {
  buffer: Buffer;
  contentType: string;
};

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

function getLeemageConfig() {
  const missing = getMissingLeemageEnv();
  if (missing.length > 0) {
    throw new Error(`LEEMAGE 설정이 필요합니다: ${missing.join(", ")}`);
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

function parseDataUrl(dataUrl: string): ImageBuffer {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match || !match[1] || !match[2]) {
    throw new InputImageStorageError(INPUT_IMAGE_INVALID);
  }
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function resolveExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/jpeg") return "jpg";
  return "bin";
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

function resolveUploadedUrl(file: {
  url: string | null;
  variants?: Array<{ url: string }>;
}) {
  const variantUrl = file.variants?.find((variant) => variant.url)?.url;
  const url = variantUrl ?? file.url;
  if (!url) {
    throw new Error("업로드된 이미지 URL을 찾을 수 없습니다.");
  }
  return url;
}

async function fetchImageBuffer(url: string): Promise<ImageBuffer> {
  let resolved: URL;
  try {
    resolved = new URL(url);
  } catch {
    throw new InputImageStorageError(INPUT_IMAGE_INVALID);
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    throw new InputImageStorageError(INPUT_IMAGE_INVALID);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(resolved.toString(), {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error("INPUT_IMAGE_FETCH_FAILED");
    }
    const contentType = response.headers.get("content-type") ?? "image/png";
    if (!contentType.startsWith("image/")) {
      throw new InputImageStorageError(INPUT_IMAGE_INVALID);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, contentType };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolveImageBuffer(source: string): Promise<ImageBuffer> {
  if (source.startsWith("data:")) {
    return parseDataUrl(source);
  }
  return fetchImageBuffer(source);
}

export async function uploadInputImages(
  requestId: string,
  images: string[],
) {
  const { provider } = resolveImageStorageProvider();
  if (!provider) {
    throw new InputImageStorageError(INPUT_IMAGE_STORAGE_REQUIRED);
  }
  if (provider !== "leemage") {
    throw new InputImageStorageError(INPUT_IMAGE_STORAGE_REQUIRED);
  }

  const client = getLeemageClient();
  const { projectId } = getLeemageConfig();
  const resolvedImages = await Promise.all(images.map(resolveImageBuffer));

  const uploads = await Promise.all(
    resolvedImages.map(({ buffer, contentType }, index) => {
      const extension = resolveExtension(contentType);
      const name = `${requestId}-input-${index + 1}.${extension}`;
      const file = buildUploadFile(buffer, name, contentType);
      return client.files.upload(projectId, file, {
        variants: [...DEFAULT_VARIANTS],
      });
    }),
  );

  return uploads.map(resolveUploadedUrl);
}

export function resolveInputImageErrorCode(error: unknown) {
  if (error instanceof InputImageStorageError) {
    return error.code;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return null;
}
