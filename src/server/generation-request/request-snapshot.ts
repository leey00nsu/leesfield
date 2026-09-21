import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import { getGradioContract, gradioInputValues } from "@/shared/model-catalog/gradio-contract";
import type { Prisma } from "@prisma/client";
import { modelCatalogSchema } from "@/server/model-catalog/catalog-schema";
import {
  inputAssetRefsFromSnapshot,
  normalizeGenerationInputAssetRefs,
  refsForSnapshot,
  type GenerationInputAssetRef,
} from "./generation-input-assets";

export function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
type Model = {type: string; parameters?: unknown; providerConfig?: unknown};

export type SnapshotRequestOptions = {
  inputAssets?: readonly GenerationInputAssetRef[];
};

const SENSITIVE_SETTING = /(?:api[_-]?key|authorization|password|secret|token|credential)/i;

function isFileLike(value: string) {
  return ["data:", "blob:", "https://", "http://", "/"].some((prefix) =>
    value.toLowerCase().startsWith(prefix),
  );
}

function displayValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[omitted]";
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    if (isFileLike(value)) return "[file]";
    return value.length > 4_000 ? value.slice(0, 4_000) + "…" : value;
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => displayValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_SETTING.test(key))
        .map(([key, item]) => [key, displayValue(item, depth + 1)]),
    );
  }
  return null;
}

function stripInputValues(
  request: Record<string, unknown>,
  refs: readonly GenerationInputAssetRef[],
) {
  const result = { ...request };
  const dynamic = recordObject(result.dynamicParams);
  let hasDynamicChanges = false;
  for (const ref of refs) {
    if (ref.field === "initImages") result.initImages = [];
    if (ref.field === "initImage") result.initImage = null;
    if (ref.field === "inputAudio") result.inputAudio = null;
    if (ref.field.startsWith("dynamicParams.")) {
      const key = ref.field.slice("dynamicParams.".length);
      if (key) {
        delete dynamic[key];
        hasDynamicChanges = true;
      }
    }
  }
  if (hasDynamicChanges) result.dynamicParams = dynamic;
  return result;
}

/** A display snapshot of model inputs, independent of the worker's payload format. */
export function requestInputs(model: Model, payload: Record<string, unknown>) {
  const contract = getGradioContract(model);
  if (contract) return gradioInputValues(contract, payload);
  const inputs: Record<string, unknown> = {};
  const dynamic = recordObject(payload.dynamicParams);
  for (const [key, raw] of Object.entries(recordObject(model.parameters))) {
    const config = recordObject(raw);
    const binding = recordObject(config.binding);
    const isDynamic = binding.source === "hf_space" && !binding.canonicalKey;
    // Only the legacy audio adapter consumes noncanonical HF bindings.
    if (isDynamic && model.type !== "audio") continue;
    const value = isDynamic ? dynamic[key] : payload[key];
    if (value === undefined) continue;
    const name = typeof binding.parameterName === "string" ? binding.parameterName : key;
    inputs[name] = value;
  }
  return inputs;
}

export async function snapshotRequest(
  type: string,
  payload: Record<string, unknown>,
  options: SnapshotRequestOptions = {},
) {
  const model = (await getModelCatalog()).find(model => model.type === type && model.key === payload.model);
  if (!model) throw new Error("MODEL_NOT_FOUND");
  const requestSettings = displayValue(requestInputs(model, payload));
  const request = getGradioContract(model) ? { ...payload, dynamicParams: requestInputs(model, payload) } : payload;
  const inputAssets = normalizeGenerationInputAssetRefs(
    type === "image" || type === "audio" || type === "video" ? type : "image",
    options.inputAssets ?? inputAssetRefsFromSnapshot(
      type === "image" || type === "audio" || type === "video" ? type : "image",
      payload,
    ),
  );
  const persistedRequest = inputAssets.length > 0
    ? stripInputValues(request, inputAssets)
    : request;
  const payloadRecord = recordObject(payload);
  const existingInputAssets = Array.isArray(payloadRecord.inputAssets)
    ? payloadRecord.inputAssets
    : null;
  return JSON.parse(JSON.stringify({...persistedRequest,
    ...(inputAssets.length > 0 ? {
      requestVersion: 3,
      inputAssets: existingInputAssets?.length ? existingInputAssets : refsForSnapshot(inputAssets),
    } : {}),
    requestSettings,
    ...(model.provider==="modal_comfyui"?{executionModel:model}:{}),
  })) as Record<string, Prisma.InputJsonValue | null>;
}

/** Only call with the server-owned persisted snapshot, never the incoming body. */
export function frozenExecutionModel(snapshot:unknown,type:string,key:unknown) {
  const raw=recordObject(snapshot).executionModel;
  if(raw===undefined)return undefined;
  const data=recordObject(raw);
  const model=modelCatalogSchema.parse([{...data,createdAt:new Date(String(data.createdAt)),updatedAt:new Date(String(data.updatedAt))}])[0];
  if(model.type!==type||model.key!==key||model.provider!=="modal_comfyui")throw new Error("EXECUTION_MODEL_MISMATCH");
  return model;
}

/** Read compatibility for v2 and v3 snapshots; input assets are hydrated by the worker. */
export function restoreRequest(snapshot: unknown): Record<string, unknown> {
  const stored = recordObject(snapshot);
  if (stored.requestVersion !== 2) return stored;
  const {parameterDefinitions, dynamicParams, ...result} = stored;
  delete result.requestVersion;
  const values = recordObject(dynamicParams);
  const dynamic: Record<string, unknown> = {};
  for (const item of Array.isArray(parameterDefinitions) ? parameterDefinitions : []) {
    const def = recordObject(item);
    if (typeof def.key !== 'string' || !Object.hasOwn(values,def.key)) continue;
    if (def.target === 'top') result[String(def.inputKey)] = values[def.key];
    else dynamic[String(def.inputKey)] = values[def.key];
  }
  return {...result,dynamicParams:dynamic};
}
