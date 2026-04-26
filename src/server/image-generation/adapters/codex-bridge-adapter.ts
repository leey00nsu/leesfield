import { z } from "zod";
import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { ImageGenerationAdapter } from "@/server/image-generation/adapters/types";
import {
  resolveInputImageBuffer,
  type ResolvedInputImageBuffer,
} from "@/server/shared/input-image-resolver";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import type { ImageModelCatalogItem } from "@/server/model-catalog/catalog-schema";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_AGENT_MODEL = "gpt-5.5";
const INPUT_IMAGE_FETCH_TIMEOUT_MS = 20_000;
const BRIDGE_GENERATE_PATH = "/v1/images/generate";

const codexBridgeConfigSchema = z
  .object({
    base_url_env: z.string().min(1),
    token_env: z.string().min(1),
    model_id: z.string().min(1),
    agent_model: z.string().min(1).optional(),
    timeout_ms: z.number().int().positive().optional(),
  })
  .strict();

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
    throw new Error("CODEX_BRIDGE_URL_REQUIRED");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("CODEX_BRIDGE_URL_REQUIRED");
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function buildGenerateUrl(baseUrl: string) {
  return `${baseUrl}${BRIDGE_GENERATE_PATH}`;
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

  const timeoutRaw = Number(providerConfig.timeout_ms ?? DEFAULT_TIMEOUT_MS);
  return {
    baseUrl: normalizeBridgeBaseUrl(rawBaseUrl),
    token,
    modelId: providerConfig.model_id.trim(),
    agentModel: providerConfig.agent_model?.trim() || DEFAULT_AGENT_MODEL,
    timeoutMs:
      Number.isFinite(timeoutRaw) && timeoutRaw > 0
        ? timeoutRaw
        : DEFAULT_TIMEOUT_MS,
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

async function requestBridgeImage(
  config: CodexBridgeConfig,
  payload: ImageGenerationFormValues,
) {
  const initImages = await resolveBridgeInitImages(payload.initImages);

  return withBridgeTimeout(config.timeoutMs, async (signal) => {
    let response: Response;

    try {
      response = await fetch(buildGenerateUrl(config.baseUrl), {
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
        signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("CODEX_BRIDGE_TIMEOUT");
      }
      throw new Error("CODEX_BRIDGE_GENERATION_FAILED");
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error("CODEX_BRIDGE_AUTH_FAILED");
    }
    if (!response.ok) {
      throw new Error("CODEX_BRIDGE_BAD_STATUS");
    }

    const parsed = await readBridgeJson(response);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("CODEX_BRIDGE_BAD_RESPONSE");
    }
    const images = (parsed as { images?: unknown }).images;
    if (!Array.isArray(images) || images.length === 0) {
      throw new Error("CODEX_BRIDGE_OUTPUT_NOT_FOUND");
    }
    if (!images.every(isDataUrlImage)) {
      throw new Error("CODEX_BRIDGE_BAD_RESPONSE");
    }
    return images;
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
      case "CODEX_BRIDGE_TOKEN_REQUIRED":
        return "Codex bridge token이 설정되어 있지 않습니다.";
      case "CODEX_BRIDGE_AUTH_FAILED":
        return "Codex bridge 인증에 실패했습니다. bridge token 설정을 확인해주세요.";
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
