import { Client, handle_file } from "@gradio/client";

import {
  resolveHfSpaceFileReference,
  selectPreferredHfSpaceFileReference,
} from "@/server/hf-space/file-reference-resolver";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import type { ImageModelCatalogItem } from "@/server/model-catalog/catalog-schema";
import { resolveInputImageBuffer } from "@/server/shared/input-image-resolver";
import {
  awaitWithTimeout,
  decodeBase64DataUrl,
  GENERATION_OUTPUT_LIMITS,
} from "@/server/http/bounded-io";
import { predictWithDeadline } from "@/server/hf-space/contract-executor";
import {
  isNodeStudioE2EMockBackgroundRemovalEnabled,
  mockBackgroundRemovalDataUrl,
} from "@/server/media-assets/node-studio-e2e-media-fixtures";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const clientCache = new Map<string, Promise<Client>>();

export type BackgroundRemovalProcessor = {
  modelKey: string;
  spaceId: string;
  spaceUrl: string;
  apiName: string;
  inputParameter: string;
  timeoutMs: number;
  token?: `hf_${string}`;
};

export async function resolveBackgroundRemovalProcessor(): Promise<BackgroundRemovalProcessor | null> {
  const catalog = await getModelCatalog();
  const model = catalog
    .filter((item): item is ImageModelCatalogItem =>
      item.type === "image" &&
      item.isActive &&
      item.provider === "hf_space" &&
      Boolean(item.meta.operations?.background_removal),
    )
    .sort((left, right) => Number(right.isDefault) - Number(left.isDefault))[0];
  if (!model || model.provider !== "hf_space") return null;
  const capability = model.meta.operations?.background_removal;
  const provider = model.providerConfig;
  if (!capability || typeof provider.space_id !== "string") return null;
  const tokenValue = process.env.HF_TOKEN?.trim() || process.env.HUGGINGFACEHUB_API_TOKEN?.trim();
  if (tokenValue && !tokenValue.startsWith("hf_")) throw new Error("INVALID_HF_TOKEN_FORMAT");
  const slug = provider.space_id.replace("/", "-");
  return {
    modelKey: model.key,
    spaceId: provider.space_id,
    spaceUrl: typeof provider.space_url === "string" && provider.space_url.trim()
      ? provider.space_url.trim()
      : `https://${slug}.hf.space`,
    apiName: capability.api_name.startsWith("/") ? capability.api_name : `/${capability.api_name}`,
    inputParameter: capability.input_parameter,
    timeoutMs: typeof provider.timeout_ms === "number" ? provider.timeout_ms : DEFAULT_TIMEOUT_MS,
    token: tokenValue as `hf_${string}` | undefined,
  };
}

async function getClient(processor: BackgroundRemovalProcessor) {
  const key = `${processor.spaceId}:${processor.token ?? "anonymous"}`;
  let client = clientCache.get(key);
  if (!client) {
    client = Client.connect(processor.spaceId, { token: processor.token });
    clientCache.set(key, client);
  }
  try {
    return await awaitWithTimeout(
      client,
      Math.min(processor.timeoutMs, 10_000),
      "HF_SPACE_CONNECT_TIMEOUT",
    );
  } catch (error) {
    if (clientCache.get(key) === client) clientCache.delete(key);
    throw error;
  }
}

export async function removeImageBackground(inputUrl: string): Promise<{
  dataUrl: string;
  modelKey: string;
}> {
  if (isNodeStudioE2EMockBackgroundRemovalEnabled()) {
    return { dataUrl: mockBackgroundRemovalDataUrl(), modelKey: "e2e-background-removal" };
  }

  const processor = await resolveBackgroundRemovalProcessor();
  if (!processor) throw new Error("PROCESSOR_UNAVAILABLE");
  let client: Client;
  try {
    client = await getClient(processor);
  } catch (error) {
    if (error instanceof Error && error.message === "HF_SPACE_CONNECT_TIMEOUT") {
      throw new Error("PROCESSOR_TIMEOUT");
    }
    throw error;
  }
  const input = await resolveInputImageBuffer(inputUrl, {
    invalidErrorCode: "PROCESSOR_INPUT_INVALID",
    fetchErrorCode: "PROCESSOR_INPUT_FETCH_FAILED",
    timeoutMs: Math.min(processor.timeoutMs, 60_000),
    maxBytes: GENERATION_OUTPUT_LIMITS.image,
  });
  const inputFile = await handle_file(new Blob([new Uint8Array(input.buffer)], { type: input.mime }));
  let result: { data: unknown };
  try {
    result = await predictWithDeadline(client, processor.apiName, {
      [processor.inputParameter]: inputFile,
    }, processor.timeoutMs);
  } catch (error) {
    if (error instanceof Error && error.message === "HF_SPACE_REQUEST_TIMEOUT") {
      throw new Error("PROCESSOR_TIMEOUT");
    }
    throw error;
  }
  const data = Array.isArray(result?.data) ? result.data : result;
  const reference = selectPreferredHfSpaceFileReference(data, {
    spaceUrl: processor.spaceUrl,
    maxDepth: 4,
  });
  if (!reference) throw new Error("PROCESSOR_RESPONSE_INVALID");
  const resolved = resolveHfSpaceFileReference(reference.value, processor.spaceUrl).normalizedUrl;
  if (resolved.startsWith("data:")) {
    const parsed = decodeBase64DataUrl(resolved, {
      maxBytes: GENERATION_OUTPUT_LIMITS.image,
      invalidCode: "PROCESSOR_RESPONSE_INVALID",
      tooLargeCode: "PROCESSOR_RESPONSE_TOO_LARGE",
    });
    if (parsed.contentType !== "image/png") throw new Error("PROCESSOR_RESPONSE_INVALID");
    return {
      dataUrl: `data:image/png;base64,${parsed.buffer.toString("base64")}`,
      modelKey: processor.modelKey,
    };
  }
  const { buffer, mime } = await resolveInputImageBuffer(resolved, {
    invalidErrorCode: "PROCESSOR_RESPONSE_INVALID",
    fetchErrorCode: "PROCESSOR_FETCH_FAILED",
    timeoutMs: Math.min(processor.timeoutMs, 60_000),
    maxBytes: GENERATION_OUTPUT_LIMITS.image,
  });
  if (mime !== "image/png") throw new Error("PROCESSOR_RESPONSE_INVALID");
  return {
    dataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
    modelKey: processor.modelKey,
  };
}
