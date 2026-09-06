import { Client, handle_file } from "@gradio/client";

import {
  resolveHfSpaceFileReference,
  selectPreferredHfSpaceFileReference,
} from "@/server/hf-space/file-reference-resolver";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import type { ImageModelCatalogItem } from "@/server/model-catalog/catalog-schema";
import { resolveInputImageBuffer } from "@/server/shared/input-image-resolver";
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
    return await client;
  } catch (error) {
    clientCache.delete(key);
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
  const client = await getClient(processor);
  const input = await handle_file(inputUrl);
  const prediction = client.predict(processor.apiName, {
    [processor.inputParameter]: input,
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      prediction,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("PROCESSOR_TIMEOUT")), processor.timeoutMs);
      }),
    ]);
    const data = Array.isArray(result?.data) ? result.data : result;
    const reference = selectPreferredHfSpaceFileReference(data, {
      spaceUrl: processor.spaceUrl,
      maxDepth: 4,
    });
    if (!reference) throw new Error("PROCESSOR_RESPONSE_INVALID");
    const resolved = resolveHfSpaceFileReference(reference.value, processor.spaceUrl).normalizedUrl;
    if (resolved.startsWith("data:")) {
      if (!resolved.startsWith("data:image/png;base64,")) throw new Error("PROCESSOR_RESPONSE_INVALID");
      return { dataUrl: resolved, modelKey: processor.modelKey };
    }
    const { buffer, mime } = await resolveInputImageBuffer(resolved, {
      invalidErrorCode: "PROCESSOR_RESPONSE_INVALID",
      fetchErrorCode: "PROCESSOR_FETCH_FAILED",
      timeoutMs: Math.min(processor.timeoutMs, 60_000),
      maxBytes: 25 * 1024 * 1024,
    });
    if (mime !== "image/png") throw new Error("PROCESSOR_RESPONSE_INVALID");
    return {
      dataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
      modelKey: processor.modelKey,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
