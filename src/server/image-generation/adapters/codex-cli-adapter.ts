import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { ImageGenerationAdapter } from "@/server/image-generation/adapters/types";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import type { ImageModelCatalogItem } from "@/server/model-catalog/catalog-schema";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const LOGIN_STATUS_TIMEOUT_MS = 10_000;
const MAX_BUFFER_BYTES = 1024 * 1024;
const OUTPUT_FILENAME = "result.png";
const IMAGE_FILE_RE = /\.(png|jpe?g|webp)$/i;

const codexCliConfigSchema = z
  .object({
    command: z.string().min(1),
    model_id: z.string().min(1),
    timeout_ms: z.number().int().positive().optional(),
  })
  .passthrough();

type CodexCliConfig = {
  command: string;
  modelId: string;
  timeoutMs: number;
};

type ExecFileOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  maxBuffer?: number;
  windowsHide?: boolean;
};

type ExecFileError = Error & {
  code?: string | number;
  killed?: boolean;
  signal?: NodeJS.Signals | null;
  stdout?: string;
  stderr?: string;
};

function execFileAsync(
  command: string,
  args: string[],
  options: ExecFileOptions,
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      const stdoutText = String(stdout ?? "");
      const stderrText = String(stderr ?? "");
      if (error) {
        const normalized = error as ExecFileError;
        normalized.stdout = stdoutText;
        normalized.stderr = stderrText;
        reject(normalized);
        return;
      }
      resolve({ stdout: stdoutText, stderr: stderrText });
    });
  });
}

function isCliMissingError(error: unknown) {
  return (
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function isTimeoutError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const normalized = error as ExecFileError;
  const message = normalized.message.toLowerCase();
  return (
    normalized.killed === true ||
    normalized.signal === "SIGTERM" ||
    normalized.code === "ETIMEDOUT" ||
    message.includes("timed out") ||
    message.includes("timeout")
  );
}

async function getCatalogImageModel(modelKey: string) {
  const catalog = await getModelCatalog({ includeInactive: true });
  const model = catalog.find(
    (item): item is ImageModelCatalogItem =>
      item.type === "image" && item.key === modelKey,
  );
  if (!model) {
    throw new Error(`IMAGE_MODEL_NOT_FOUND:${modelKey}`);
  }
  return model;
}

async function getCodexConfig(modelKey: ImageGenerationFormValues["model"]) {
  const model = await getCatalogImageModel(modelKey);
  if (model.provider !== "codex_cli") {
    throw new Error("IMAGE_PROVIDER_NOT_SUPPORTED");
  }
  const parsedConfig = codexCliConfigSchema.safeParse(model.providerConfig);
  if (!parsedConfig.success) {
    throw new Error("CODEX_CLI_CONFIG_INVALID");
  }
  const providerConfig = parsedConfig.data;
  const timeoutRaw = Number(providerConfig.timeout_ms ?? DEFAULT_TIMEOUT_MS);

  return {
    command: providerConfig.command.trim(),
    modelId: providerConfig.model_id.trim(),
    timeoutMs:
      Number.isFinite(timeoutRaw) && timeoutRaw > 0
        ? timeoutRaw
        : DEFAULT_TIMEOUT_MS,
  } satisfies CodexCliConfig;
}

async function ensureChatGptOAuth(command: string) {
  try {
    const result = await execFileAsync(command, ["login", "status"], {
      timeout: LOGIN_STATUS_TIMEOUT_MS,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    });
    const output = `${result.stdout}\n${result.stderr}`;
    if (!/Logged in using ChatGPT/i.test(output)) {
      throw new Error("CODEX_OAUTH_REQUIRED");
    }
  } catch (error) {
    if (isCliMissingError(error)) {
      throw new Error("CODEX_CLI_NOT_FOUND");
    }
    if (isTimeoutError(error)) {
      throw new Error("CODEX_IMAGE_TIMEOUT");
    }
    if (error instanceof Error && error.message === "CODEX_OAUTH_REQUIRED") {
      throw error;
    }
    throw new Error("CODEX_OAUTH_REQUIRED");
  }
}

function buildPrompt(payload: ImageGenerationFormValues, outputPath: string) {
  const prompt = payload.prompt.trim();
  return [
    "Generate exactly one image using the requested image generation model.",
    `Prompt: ${prompt}`,
    `Canvas: ${payload.width}x${payload.height}px.`,
    "",
    `Save the final image as a PNG file exactly at: ${outputPath}`,
    "Do not write any other files. Reply with only the saved image path.",
  ].join("\n");
}

function buildExecArgs(
  config: CodexCliConfig,
  tempDir: string,
  outputPath: string,
  payload: ImageGenerationFormValues,
) {
  return [
    "exec",
    "--skip-git-repo-check",
    "--full-auto",
    "--ephemeral",
    "--cd",
    tempDir,
    "--model",
    config.modelId,
    buildPrompt(payload, outputPath),
  ];
}

function mapCliFailure(error: unknown) {
  if (isCliMissingError(error)) {
    throw new Error("CODEX_CLI_NOT_FOUND");
  }
  if (isTimeoutError(error)) {
    throw new Error("CODEX_IMAGE_TIMEOUT");
  }
  if (
    error instanceof Error &&
    [
      "CODEX_CLI_NOT_FOUND",
      "CODEX_OAUTH_REQUIRED",
      "CODEX_IMAGE_TIMEOUT",
      "CODEX_IMAGE_OUTPUT_NOT_FOUND",
    ].includes(error.message)
  ) {
    throw error;
  }
  throw new Error("CODEX_IMAGE_GENERATION_FAILED");
}

function getImageMime(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".png":
    default:
      return "image/png";
  }
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readImageAsDataUrl(filePath: string) {
  const buffer = await readFile(filePath);
  return `data:${getImageMime(filePath)};base64,${buffer.toString("base64")}`;
}

function extractImagePaths(output: string) {
  const candidates = new Set<string>();
  const pathMatches = output.matchAll(/(?:\/[^\s"'`]+?\.(?:png|jpg|jpeg|webp))/gi);
  for (const match of pathMatches) {
    candidates.add(match[0]);
  }
  return [...candidates];
}

function isAllowedFallbackPath(filePath: string, tempDir: string) {
  const resolved = path.resolve(filePath);
  const resolvedTempDir = path.resolve(tempDir);
  const codexHome = path.resolve(process.env.CODEX_HOME ?? path.join(homedir(), ".codex"));
  const generatedImagesDir = path.join(codexHome, "generated_images");
  return (
    resolved.startsWith(`${resolvedTempDir}${path.sep}`) ||
    resolved === path.join(resolvedTempDir, OUTPUT_FILENAME) ||
    resolved.startsWith(`${generatedImagesDir}${path.sep}`)
  );
}

async function findNewestImageFile(dirPath: string, earliestMs: number, depth = 0) {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return null;
  }

  let best: { filePath: string; mtimeMs: number } | null = null;
  for (const entry of entries) {
    const filePath = path.join(dirPath, entry.name);
    if (entry.isDirectory() && depth < 2) {
      const nested = await findNewestImageFile(filePath, earliestMs, depth + 1);
      if (nested && (!best || nested.mtimeMs > best.mtimeMs)) {
        best = nested;
      }
      continue;
    }
    if (!entry.isFile() || !IMAGE_FILE_RE.test(entry.name)) {
      continue;
    }
    const metadata = await stat(filePath);
    if (metadata.mtimeMs < earliestMs - 1000) {
      continue;
    }
    if (!best || metadata.mtimeMs > best.mtimeMs) {
      best = { filePath, mtimeMs: metadata.mtimeMs };
    }
  }
  return best;
}

async function resolveGeneratedImagePath(
  outputPath: string,
  tempDir: string,
  cliOutput: string,
  startedAtMs: number,
) {
  if (await exists(outputPath)) {
    return outputPath;
  }

  for (const candidate of extractImagePaths(cliOutput)) {
    if (!isAllowedFallbackPath(candidate, tempDir)) {
      continue;
    }
    if (await exists(candidate)) {
      return candidate;
    }
  }

  const tempDirImage = await findNewestImageFile(tempDir, startedAtMs);
  if (tempDirImage) {
    return tempDirImage.filePath;
  }

  const codexGeneratedImagesDir = path.join(
    process.env.CODEX_HOME ?? path.join(homedir(), ".codex"),
    "generated_images",
  );
  const codexImage = await findNewestImageFile(codexGeneratedImagesDir, startedAtMs);
  return codexImage?.filePath ?? null;
}

async function runCodexGeneration(
  config: CodexCliConfig,
  payload: ImageGenerationFormValues,
) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "leesfield-codex-image-"));
  const outputPath = path.join(tempDir, OUTPUT_FILENAME);
  const startedAtMs = Date.now();

  try {
    let result: { stdout: string; stderr: string };
    try {
      result = await execFileAsync(
        config.command,
        buildExecArgs(config, tempDir, outputPath, payload),
        {
          cwd: tempDir,
          env: {
            ...process.env,
            CODEX_IMAGE_MODEL: config.modelId,
            CODEX_IMAGE_OUTPUT_PATH: outputPath,
          },
          timeout: config.timeoutMs,
          maxBuffer: MAX_BUFFER_BYTES,
          windowsHide: true,
        },
      );
    } catch (error) {
      mapCliFailure(error);
      throw error;
    }

    const imagePath = await resolveGeneratedImagePath(
      outputPath,
      tempDir,
      `${result.stdout}\n${result.stderr}`,
      startedAtMs,
    );
    if (!imagePath) {
      throw new Error("CODEX_IMAGE_OUTPUT_NOT_FOUND");
    }
    return readImageAsDataUrl(imagePath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export const codexCliImageAdapter: ImageGenerationAdapter = {
  mapError(error: unknown) {
    if (!(error instanceof Error)) {
      return "Codex CLI 이미지 생성에 실패했습니다.";
    }
    switch (error.message) {
      case "CODEX_CLI_NOT_FOUND":
        return "Codex CLI를 찾을 수 없습니다. 서버 환경에 codex를 설치해주세요.";
      case "CODEX_OAUTH_REQUIRED":
        return "Codex CLI에 ChatGPT OAuth 로그인이 필요합니다.";
      case "CODEX_IMAGE_TIMEOUT":
        return "Codex CLI 이미지 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
      case "CODEX_IMAGE_OUTPUT_NOT_FOUND":
        return "Codex CLI가 생성한 이미지 파일을 찾을 수 없습니다.";
      case "CODEX_CLI_CONFIG_INVALID":
        return "Codex CLI 이미지 모델 설정이 올바르지 않습니다.";
      case "CODEX_IMAGE_GENERATION_FAILED":
        return "Codex CLI 이미지 생성에 실패했습니다. 잠시 후 다시 시도해주세요.";
      default:
        return "Codex CLI 이미지 생성에 실패했습니다.";
    }
  },
  async generate(payload: ImageGenerationFormValues) {
    const config = await getCodexConfig(payload.model);
    await ensureChatGptOAuth(config.command);
    const dataUrl = await runCodexGeneration(config, payload);
    return { images: [dataUrl] };
  },
};
