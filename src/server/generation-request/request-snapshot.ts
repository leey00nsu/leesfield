import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import { getGradioContract, gradioInputValues } from "@/shared/model-catalog/gradio-contract";
import type { Prisma } from "@prisma/client";

export function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
type Model = {type: string; parameters?: unknown; providerConfig?: unknown};

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

export async function snapshotRequest(type: string, payload: Record<string, unknown>) {
  const model = (await getModelCatalog()).find(model => model.type === type && model.key === payload.model);
  if (!model) throw new Error("MODEL_NOT_FOUND");
  return JSON.parse(JSON.stringify({...payload, requestSettings: requestInputs(model,payload)})) as Record<string, Prisma.InputJsonValue | null>;
}

/** Read compatibility only for the briefly used v2 format. New requests need no reconstruction. */
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
