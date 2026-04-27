import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { ImageGenerationAdapter } from "@/server/image-generation/adapters/types";
import {
  resolveInputImageBuffer,
  type ResolvedInputImageBuffer,
} from "@/server/shared/input-image-resolver";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import {
  codexBridgeConfigSchema,
  type ImageModelCatalogItem,
} from "@/server/model-catalog/catalog-schema";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_AGENT_MODEL = "gpt-5.5";
const INPUT_IMAGE_FETCH_TIMEOUT_MS = 20_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const BRIDGE_JOBS_PATH = "/v1/images/jobs";

type CodexBridgeConfig = {
  baseUrl: string;
  token: string;
  modelId: string;
  agentModel: string;
  timeoutMs: number;
};

function getEnvValue(envName: string) {
  return process.env[envName]?.trim() ?? "";
}

function normalizeBridgeBaseUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("CODEX_BRIDGE_URL_INVALID");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("CODEX_BRIDGE_URL_INVALID");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("CODEX_BRIDGE_URL_INVALID");
  }
  return url.origin;
}

function buildJobsUrl(baseUrl: string) {
  return new URL(BRIDGE_JOBS_PATH, `${baseUrl}/`).toString();
}

function buildJobUrl(baseUrl: string, jobId: string) {
  return new URL(
    `${BRIDGE_JOBS_PATH}/${encodeURIComponent(jobId)}`,
    `${baseUrl}/`,
  ).toString();
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

async function getBridgeConfig(modelKey: ImageGenerationFormValues["model"]) {
  const model = await getCatalogImageModel(modelKey);
  if (model.provider !== "codex_bridge") {
    throw new Error("IMAGE_PROVIDER_NOT_SUPPORTED");
  }
  const parsedConfig = codexBridgeConfigSchema.safeParse(model.providerConfig);
  if (!parsedConfig.success) {
    throw new Error("CODEX_BRIDGE_CONFIG_INVALID");
  }

  const providerConfig = parsedConfig.data;
  const rawBaseUrl = getEnvValue(providerConfig.base_url_env);
  if (!rawBaseUrl) {
    throw new Error("CODEX_BRIDGE_URL_REQUIRED");
  }
  const token = getEnvValue(providerConfig.token_env);
  if (!token) {
    throw new Error("CODEX_BRIDGE_TOKEN_REQUIRED");
  }

  return {
    baseUrl: normalizeBridgeBaseUrl(rawBaseUrl),
    token,
    modelId: providerConfig.model_id.trim(),
    agentModel: providerConfig.agent_model?.trim() || DEFAULT_AGENT_MODEL,
    timeoutMs: providerConfig.timeout_ms ?? DEFAULT_TIMEOUT_MS,
  } satisfies CodexBridgeConfig;
}

function toDataUrl({ buffer, mime }: ResolvedInputImageBuffer) {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function resolveBridgeInitImages(images: string[] | undefined) {
  const inputImages = images ?? [];
  if (inputImages.length === 0) {
    return [];
  }

  return Promise.all(
    inputImages.map(async (source) => {
      const resolved = await resolveInputImageBuffer(source, {
        invalidErrorCode: "CODEX_BRIDGE_INPUT_INVALID",
        fetchErrorCode: "CODEX_BRIDGE_INPUT_INVALID",
        notBase64ErrorCode: "CODEX_BRIDGE_INPUT_INVALID",
        timeoutMs: INPUT_IMAGE_FETCH_TIMEOUT_MS,
      });
      if (!resolved.mime.startsWith("image/")) {
        throw new Error("CODEX_BRIDGE_INPUT_INVALID");
      }
      return toDataUrl(resolved);
    }),
  );
}

function isDataUrlImage(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/[^;]+;base64,/i.test(value);
}

async function readBridgeJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("CODEX_BRIDGE_TIMEOUT");
    }
    throw new Error("CODEX_BRIDGE_BAD_RESPONSE");
  }
}

function isBridgeObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getBridgeErrorCode(parsed: unknown) {
  if (!isBridgeObject(parsed) || !isBridgeObject(parsed.error)) {
    return undefined;
  }
  const code = parsed.error.code;
  return typeof code === "string" ? code : undefined;
}

function mapBridgeErrorCode(code: unknown, fallback: string) {
  switch (code) {
    case "UNAUTHORIZED":
      return "CODEX_BRIDGE_AUTH_FAILED";
    case "CODEX_OAUTH_REQUIRED":
      return "CODEX_BRIDGE_OAUTH_REQUIRED";
    case "CODEX_CLI_NOT_FOUND":
      return "CODEX_BRIDGE_CLI_NOT_FOUND";
    case "CODEX_IMAGE_TIMEOUT":
      return "CODEX_BRIDGE_TIMEOUT";
    case "CODEX_IMAGE_OUTPUT_NOT_FOUND":
      return "CODEX_BRIDGE_OUTPUT_NOT_FOUND";
    case "CODEX_IMAGE_OUTPUT_INVALID":
      return "CODEX_BRIDGE_BAD_RESPONSE";
    case "CODEX_BRIDGE_INPUT_INVALID":
      return "CODEX_BRIDGE_INPUT_INVALID";
    case "CODEX_IMAGE_GENERATION_FAILED":
      return "CODEX_BRIDGE_GENERATION_FAILED";
    default:
      return fallback;
  }
}

function mapBridgeHttpErrorCode(code: unknown) {
  switch (code) {
    case "UNAUTHORIZED":
      return "CODEX_BRIDGE_AUTH_FAILED";
    case "CODEX_OAUTH_REQUIRED":
      return "CODEX_BRIDGE_OAUTH_REQUIRED";
    case "CODEX_CLI_NOT_FOUND":
      return "CODEX_BRIDGE_CLI_NOT_FOUND";
    case "CODEX_IMAGE_TIMEOUT":
      return "CODEX_BRIDGE_TIMEOUT";
    case "CODEX_BRIDGE_INPUT_INVALID":
      return "CODEX_BRIDGE_INPUT_INVALID";
    default:
      return "CODEX_BRIDGE_BAD_STATUS";
  }
}

async function throwForBridgeHttpError(response: Response) {
  if (response.status === 401 || response.status === 403) {
    throw new Error("CODEX_BRIDGE_AUTH_FAILED");
  }
  if (response.ok) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = await readBridgeJson(response);
  } catch (error) {
    if (error instanceof Error && error.message === "CODEX_BRIDGE_TIMEOUT") {
      throw error;
    }
    throw new Error("CODEX_BRIDGE_BAD_STATUS");
  }
  throw new Error(mapBridgeHttpErrorCode(getBridgeErrorCode(parsed)));
}

async function withBridgeTimeout<T>(
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
) {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error("CODEX_BRIDGE_TIMEOUT"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([task(controller.signal), timeoutPromise]);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("CODEX_BRIDGE_TIMEOUT");
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function makeAbortError() {
  return Object.assign(new Error("aborted"), { name: "AbortError" });
}

function waitForNextPoll(signal: AbortSignal) {
  if (signal.aborted) {
    throw makeAbortError();
  }

  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      reject(makeAbortError());
    };
    const timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, DEFAULT_POLL_INTERVAL_MS);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchBridge(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
) {
  try {
    return await fetch(url, { ...init, signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("CODEX_BRIDGE_TIMEOUT");
    }
    throw new Error("CODEX_BRIDGE_BAD_STATUS");
  }
}

function assertBridgeJobId(parsed: unknown) {
  if (!isBridgeObject(parsed)) {
    throw new Error("CODEX_BRIDGE_BAD_RESPONSE");
  }
  const jobId = parsed.jobId;
  const status = parsed.status;
  if (
    typeof jobId !== "string" ||
    !jobId ||
    (status !== "queued" && status !== "processing" && status !== "completed")
  ) {
    throw new Error("CODEX_BRIDGE_BAD_RESPONSE");
  }
  return jobId;
}

function assertCompletedImages(parsed: Record<string, unknown>) {
  const images = parsed.images;
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error("CODEX_BRIDGE_OUTPUT_NOT_FOUND");
  }
  if (!images.every(isDataUrlImage)) {
    throw new Error("CODEX_BRIDGE_BAD_RESPONSE");
  }
  return images;
}

async function createBridgeJob(
  config: CodexBridgeConfig,
  payload: ImageGenerationFormValues,
  initImages: string[],
  signal: AbortSignal,
) {
  const response = await fetchBridge(
    buildJobsUrl(config.baseUrl),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        prompt: payload.prompt.trim(),
        modelId: config.modelId,
        agentModel: config.agentModel,
        width: payload.width,
        height: payload.height,
        initImages,
      }),
    },
    signal,
  );
  await throwForBridgeHttpError(response);
  return assertBridgeJobId(await readBridgeJson(response));
}

async function pollBridgeJob(
  config: CodexBridgeConfig,
  jobId: string,
  signal: AbortSignal,
) {
  while (true) {
    const response = await fetchBridge(
      buildJobUrl(config.baseUrl, jobId),
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${config.token}`,
        },
      },
      signal,
    );
    await throwForBridgeHttpError(response);

    const parsed = await readBridgeJson(response);
    if (!isBridgeObject(parsed)) {
      throw new Error("CODEX_BRIDGE_BAD_RESPONSE");
    }

    switch (parsed.status) {
      case "queued":
      case "processing":
        await waitForNextPoll(signal);
        break;
      case "completed":
        return assertCompletedImages(parsed);
      case "failed":
        throw new Error(
          mapBridgeErrorCode(
            getBridgeErrorCode(parsed),
            "CODEX_BRIDGE_GENERATION_FAILED",
          ),
        );
      default:
        throw new Error("CODEX_BRIDGE_BAD_RESPONSE");
    }
  }
}

async function requestBridgeImage(
  config: CodexBridgeConfig,
  payload: ImageGenerationFormValues,
) {
  const initImages = await resolveBridgeInitImages(payload.initImages);

  return withBridgeTimeout(config.timeoutMs, async (signal) => {
    const jobId = await createBridgeJob(config, payload, initImages, signal);
    return pollBridgeJob(config, jobId, signal);
  });
}

export const codexBridgeImageAdapter: ImageGenerationAdapter = {
  mapError(error: unknown) {
    if (!(error instanceof Error)) {
      return "Codex bridge 이미지 생성에 실패했습니다.";
    }
    if (error.message.startsWith("IMAGE_MODEL_NOT_FOUND")) {
      return "요청한 이미지 모델을 찾을 수 없습니다.";
    }
    if (error.message.startsWith("IMAGE_PROVIDER_NOT_SUPPORTED")) {
      return "요청한 이미지 제공자가 지원되지 않습니다.";
    }
    switch (error.message) {
      case "CODEX_BRIDGE_URL_REQUIRED":
        return "Codex bridge URL이 설정되어 있지 않습니다.";
      case "CODEX_BRIDGE_URL_INVALID":
        return "Codex bridge URL 형식이 올바르지 않습니다. http(s) origin만 입력해주세요.";
      case "CODEX_BRIDGE_TOKEN_REQUIRED":
        return "Codex bridge token이 설정되어 있지 않습니다.";
      case "CODEX_BRIDGE_AUTH_FAILED":
        return "Codex bridge 인증에 실패했습니다. bridge token 설정을 확인해주세요.";
      case "CODEX_BRIDGE_OAUTH_REQUIRED":
        return "Codex bridge의 Codex OAuth 로그인이 필요합니다. bridge 컨테이너에서 codex login 상태를 확인해주세요.";
      case "CODEX_BRIDGE_CLI_NOT_FOUND":
        return "Codex bridge 컨테이너에서 Codex CLI를 찾을 수 없습니다.";
      case "CODEX_BRIDGE_TIMEOUT":
        return "Codex bridge 이미지 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
      case "CODEX_BRIDGE_BAD_RESPONSE":
        return "Codex bridge 응답 형식이 올바르지 않습니다.";
      case "CODEX_BRIDGE_OUTPUT_NOT_FOUND":
        return "Codex bridge가 생성한 이미지 결과를 찾을 수 없습니다.";
      case "CODEX_BRIDGE_BAD_STATUS":
        return "Codex bridge 호출에 실패했습니다. bridge 서비스 상태를 확인해주세요.";
      case "CODEX_BRIDGE_INPUT_INVALID":
        return "입력 이미지 형식이 올바르지 않습니다. 다른 이미지를 사용해주세요.";
      case "CODEX_BRIDGE_CONFIG_INVALID":
        return "Codex bridge 이미지 모델 설정이 올바르지 않습니다.";
      case "CODEX_BRIDGE_GENERATION_FAILED":
        return "Codex bridge 이미지 생성에 실패했습니다. 잠시 후 다시 시도해주세요.";
      default:
        return "Codex bridge 이미지 생성에 실패했습니다.";
    }
  },
  async generate(payload: ImageGenerationFormValues) {
    const config = await getBridgeConfig(payload.model);
    const images = await requestBridgeImage(config, payload);
    return { images };
  },
};
