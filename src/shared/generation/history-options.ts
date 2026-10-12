import { z } from "zod";
import { getGradioContract, gradioInputValues, jsonValueSchema, type JsonValue } from "@/shared/model-catalog/gradio-contract";
import { numericParameterValue, parameterKind, parameterValueIssue } from "@/shared/model-catalog/parameter-contract";
import type { RuntimeImageModel, RuntimeVideoModel, RuntimeAudioModel } from "@/shared/model-catalog/runtime-utils";

type Model = RuntimeImageModel | RuntimeVideoModel | RuntimeAudioModel;
const safeKey = (key: string) => !["__proto__", "constructor", "prototype"].includes(key);
export const historyOptionsSchema = z.array(z.object({
  field: z.string().regex(/^(dynamicParams\.)?[a-zA-Z][a-zA-Z0-9_]*$/).refine(v => safeKey(v.split(".").at(-1)!)),
  value: jsonValueSchema,
}));
export type HistoryOption = z.infer<typeof historyOptionsSchema>[number];
export const legacyHistoryOptionNames = {
  image: ["width", "height", "steps", "guidanceScale", "seed", "modeChoice", "promptUpsampling", "imageCount"],
  video: ["aspectRatio", "resolution", "durationSec", "fps", "steps", "guidanceScale", "seed"],
  audio: ["voice", "speaker", "speed", "seed", "referenceText", "modeChoice", "language", "streamMode", "referencePreset", "customInstruction", "voiceInstruction", "xvecOnly", "chunkSize", "temperature", "topK", "repetitionPenalty"],
} as const;
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function legacyHistoryOptionPath(media: keyof typeof legacyHistoryOptionNames, key: string, definition: unknown) {
  const config = object(definition), binding = object(config.binding);
  if (!safeKey(key) || config.ui === "upload" || ["file", "files", "gallery"].includes(String(binding.kind ?? binding.valueType))) return null;
  if (media === "audio" && binding.source === "hf_space" && !binding.canonicalKey) return "dynamicParams." + key;
  return (legacyHistoryOptionNames[media] as readonly string[]).includes(key) ? key : null;
}

/** Project saved options into current authoring fields before mutating any draft. */
export function historyOptionUpdates(options: HistoryOption[], model: Model) {
  const contract = getGradioContract(model);
  const updates: Record<string, JsonValue> = {};
  for (const option of options) {
    const key = option.field.startsWith("dynamicParams.") ? option.field.slice(14) : option.field;
    let value: JsonValue = option.value;
    if (Object.hasOwn(updates, option.field)) throw new Error("HISTORY_OPTION_DUPLICATE");
    if (contract) {
      const field = contract.inputs.find(f => f.name === key && f.canonical !== "prompt" && !["file", "files", "gallery"].includes(f.kind));
      if (!field || option.field !== "dynamicParams." + key) throw new Error("HISTORY_OPTION_UNAVAILABLE");
      gradioInputValues({ ...contract, inputs: [field], inputRules: undefined, inputGroups: undefined }, { dynamicParams: { [key]: value } });
    } else {
      const config = object(model.parameters[key]);
      if (!Object.hasOwn(model.parameters, key) || legacyHistoryOptionPath(model.type, key, config) !== option.field) throw new Error("HISTORY_OPTION_UNAVAILABLE");
      const numeric = parameterKind(key, config) === "number" ? numericParameterValue(value) : value;
      if (value !== "" && parameterValueIssue(key, config, numeric)) throw new Error("HISTORY_OPTION_INVALID");
      value = key === "seed" && !option.field.startsWith("dynamicParams.") ? String(value ?? "") : numeric as JsonValue;
    }
    updates[option.field] = value;
  }
  return updates;
}
