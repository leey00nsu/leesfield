"use client";
import { getGradioContract } from "@/shared/model-catalog/gradio-contract";
import { GradioContractFields } from "@/shared/ui/gradio-contract-fields";
import { Switch } from "@/shared/ui/brand/switch/switch";
import { AppTextarea } from "@/shared/ui/app-form-control";

import type {
  RuntimeAudioModel,
  RuntimeImageModel,
  RuntimeParameterConfig,
  RuntimeParameterValue,
  RuntimeVideoModel,
} from "@/shared/model-catalog/runtime-utils";
import { normalizeRuntimeParameterOptions } from "@/shared/model-catalog/parameter-options";
import {
  AppSelectContent,
  AppSelectItem,
  AppSelectRoot,
  AppSelectTrigger,
  AppSelectValue,
} from "@/shared/ui/app-select";
import { AppInput } from "@/shared/ui/app-input";

export type GenerationRuntimeModel = RuntimeAudioModel | RuntimeImageModel | RuntimeVideoModel;

const excludedKeys = new Set(["prompt", "model", "initImage", "inputAudio"]);
const audioCanonicalKeys = new Set([
  "voice",
  "speaker",
  "speed",
  "seed",
  "referenceText",
  "modeChoice",
  "language",
  "streamMode",
  "referencePreset",
  "customInstruction",
  "voiceInstruction",
  "xvecOnly",
  "chunkSize",
  "temperature",
  "topK",
  "repetitionPenalty",
]);

function parameterConfig(value: unknown): RuntimeParameterConfig | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RuntimeParameterConfig
    : null;
}

function parameterLabel(key: string, config: RuntimeParameterConfig) {
  if (typeof config.label === "string" && config.label.trim()) return config.label;
  const providerName = config.binding?.parameterName;
  if (typeof providerName === "string" && providerName.trim()) return providerName;
  return key
    .replace(/^.*:/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ");
}

function isDynamicAudioParameter(model: GenerationRuntimeModel, key: string) {
  return model.type === "audio" && !audioCanonicalKeys.has(key);
}

export function resolveGenerationNodeParameterDefaults(model: GenerationRuntimeModel) {
  const dynamicParams: Record<string, RuntimeParameterValue> = {};
  for (const [key, value] of Object.entries(model.parameters)) {
    const config = parameterConfig(value);
    if (!config || config.default === undefined || !isDynamicAudioParameter(model, key)) continue;
    dynamicParams[key] = config.default;
  }
  return Object.keys(dynamicParams).length > 0 ? { dynamicParams } : {};
}

export function GenerationNodeParameterControls({
  model,
  values,
  disabled,
  onChange,
}: {
  model: GenerationRuntimeModel;
  values: Record<string, unknown>;
  disabled: boolean;
  onChange: (values: Record<string, unknown>) => void;
}) {
  const dynamicValues = values.dynamicParams && typeof values.dynamicParams === "object" && !Array.isArray(values.dynamicParams)
    ? values.dynamicParams as Record<string, unknown>
    : {};
  if (model.provider === "modal_comfyui") {
    const contract=getGradioContract(model)!;
    return <fieldset disabled={disabled}><GradioContractFields contract={{...contract,inputGroups:undefined,inputs:contract.inputs.filter(f=>!["file","files","gallery"].includes(f.kind)&&!f.canonical)}} values={dynamicValues} prompt="" onChange={dynamicParams=>onChange({...values,dynamicParams})}/></fieldset>;
  }
  const fields = Object.entries(model.parameters)
    .flatMap(([key, value]) => {
      const config = parameterConfig(value);
      if (
        !config ||
        excludedKeys.has(key) ||
        config.ui === "hidden" ||
        config.ui === "upload" ||
        config.binding?.valueType === "file"
      ) return [];
      return [{ key, config, dynamic: isDynamicAudioParameter(model, key) }];
    })
    .sort((left, right) => {
      const leftOrder = left.config.binding?.order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.config.binding?.order ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.key.localeCompare(right.key);
    });

  if (fields.length === 0) return null;

  const update = (key: string, value: RuntimeParameterValue, dynamic: boolean) => {
    if (dynamic) {
      onChange({ ...values, dynamicParams: { ...dynamicValues, [key]: value } });
      return;
    }
    onChange({ ...values, [key]: value });
  };

  return (
    <div className="grid gap-2">
      {fields.map(({ key, config, dynamic }) => {
        const label = `${parameterLabel(key, config)}${config.required ? " *" : ""}`;
        const value = (dynamic ? dynamicValues[key] : values[key]) ?? config.default ?? "";
        const options = normalizeRuntimeParameterOptions(config.options);
        const baseClass = "w-full text-sm normal-case tracking-normal";

        return (
          <label key={key} className="grid gap-1 text-[10px] uppercase tracking-[0.12em] text-white/45">
            {label}
            {options?.length ? (
              <AppSelectRoot
                value={isEmptyParameterValue(value) ? "__none__" : String(value)}
                disabled={disabled}
                onValueChange={(nextValue) => {
                  if (nextValue === "__none__") {
                    update(key, "", dynamic);
                    return;
                  }
                  const option = options.find((candidate) => String(candidate.value) === nextValue);
                  if (option) update(key, option.value, dynamic);
                }}
              >
                <AppSelectTrigger triggerSize="sm" className={baseClass} aria-label={label}>
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent className="z-[10002]">
                  {!config.required ? <AppSelectItem value="__none__">—</AppSelectItem> : null}
                  {options.map((option) => (
                    <AppSelectItem key={`${key}-${option.value}`} value={String(option.value)}>{option.label}</AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelectRoot>
            ) : config.ui === "toggle" ? (
              <Switch
                checked={Boolean(value)}
                disabled={disabled}

                onCheckedChange={checked => update(key, checked, dynamic)}
              />
            ) : config.ui === "range" || typeof value === "number" || typeof config.default === "number" ? (
              <AppInput
                type="number"
                value={typeof value === "number" || typeof value === "string" ? value : ""}
                min={config.min}
                max={config.max}
                step={config.step ?? "any"}
                disabled={disabled}
                className={baseClass}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) update(key, next, dynamic);
                }}
              />
            ) : config.ui === "textarea" ? (
              <AppTextarea
                value={String(value)}
                rows={2}
                disabled={disabled}
                className="resize-none rounded-lg border border-white/10 bg-black/25 px-2 py-1.5 text-xs normal-case tracking-normal text-white outline-none focus:border-primary/70"
                onChange={(event) => update(key, event.target.value, dynamic)}
              />
            ) : (
              <AppInput
                type="text"
                value={String(value)}
                disabled={disabled}
                className={baseClass}
                onChange={(event) => update(key, event.target.value, dynamic)}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

function isEmptyParameterValue(value: unknown) {
  return value === undefined || value === null || value === "";
}
