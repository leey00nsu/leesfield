"use client";

import { useState } from "react";
import { Layers, Maximize2, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  applyImageModeChoice,
  applyImageSizePreset,
  authoringValuesToImageConfig,
  isImageAuthoringNumberValid,
  resolveImageSizePreset,
  type ImageAuthoringValues,
  type ImageSizePreset,
} from "@/shared/generation/image-authoring";
import {
  getRuntimeParameterOptionLabel,
  getRuntimeParameterOptionValue,
} from "@/shared/model-catalog/parameter-options";
import {
  getRuntimeImageParamConfig,
  getRuntimeImageParamRange,
  type RuntimeImageModel,
} from "@/shared/model-catalog/runtime-utils";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { GenerationSettingsPopover } from "@/shared/ui/generation-settings-popover";

import type { ImageGenerationNodeConfigDto } from "../../model/graph-types";

type NumericKey = "width" | "height" | "imageCount" | "steps" | "guidanceScale";

type ImageNodeParameterControlsProps = {
  model: RuntimeImageModel;
  values: ImageAuthoringValues;
  onChange: (config: ImageGenerationNodeConfigDto) => void;
};

const sizePresets: ImageSizePreset[] = ["1:1", "16:9", "9:16", "4:3", "3:4"];

export function ImageNodeParameterControls({ model, values, onChange }: ImageNodeParameterControlsProps) {
  const t = useTranslations("nodeStudio");
  const labels = useTranslations("common.labels");
  const [drafts, setDrafts] = useState<Record<NumericKey, string>>({
    width: String(values.width),
    height: String(values.height),
    imageCount: String(values.imageCount),
    steps: String(values.steps),
    guidanceScale: String(values.guidanceScale),
  });
  const [errors, setErrors] = useState<Partial<Record<NumericKey, boolean>>>({});

  const configs = {
    width: getRuntimeImageParamConfig(model, "width"),
    height: getRuntimeImageParamConfig(model, "height"),
    imageCount: getRuntimeImageParamConfig(model, "imageCount"),
    steps: getRuntimeImageParamConfig(model, "steps"),
    modeChoice: getRuntimeImageParamConfig(model, "modeChoice"),
    guidanceScale: getRuntimeImageParamConfig(model, "guidanceScale"),
    promptUpsampling: getRuntimeImageParamConfig(model, "promptUpsampling"),
    seed: getRuntimeImageParamConfig(model, "seed"),
  };
  const visible = (key: keyof typeof configs) => Boolean(configs[key]) && configs[key]?.ui !== "hidden";
  const hasSize = visible("width") || visible("height");
  const hasAdvanced = ["steps", "modeChoice", "guidanceScale", "promptUpsampling", "seed"].some(
    (key) => visible(key as keyof typeof configs),
  );
  const modeOptions = configs.modeChoice?.options ?? [];
  const activePreset = resolveImageSizePreset(values.width, values.height);

  const publish = (next: ImageAuthoringValues) => {
    onChange(authoringValuesToImageConfig(next, model) as ImageGenerationNodeConfigDto);
  };

  const setNumeric = (key: NumericKey, raw: string) => {
    setDrafts((current) => ({ ...current, [key]: raw }));
    const number = raw.trim() ? Number(raw) : Number.NaN;
    const valid = isImageAuthoringNumberValid(model, key, number);
    setErrors((current) => ({ ...current, [key]: !valid }));
    if (valid) publish({ ...values, [key]: number });
  };

  const stepCount = (direction: 1 | -1) => {
    const range = getRuntimeImageParamRange(model, "imageCount");
    const next = Math.min(
      range.max,
      Math.max(range.min, values.imageCount + direction * Math.max(1, range.step)),
    );
    setDrafts((current) => ({ ...current, imageCount: String(next) }));
    setErrors((current) => ({ ...current, imageCount: false }));
    publish({ ...values, imageCount: next });
  };

  const applySize = (preset: ImageSizePreset) => {
    const next = applyImageSizePreset(preset, model);
    setDrafts((current) => ({
      ...current,
      width: String(next.width),
      height: String(next.height),
    }));
    setErrors((current) => ({ ...current, width: false, height: false }));
    publish({ ...values, ...next });
  };

  const numericField = (key: NumericKey, label: string) => {
    const range = getRuntimeImageParamRange(model, key);
    return (
      <label className="grid gap-1.5 text-xs font-semibold text-white/55">
        <span>{label}</span>
        <AppInput
          type="number"
          value={drafts[key]}
          min={range.min}
          max={range.max}
          step={range.step}
          aria-invalid={errors[key] || undefined}
          onChange={(event) => setNumeric(key, event.target.value)}
          className="h-10 border-white/10 bg-black/30 text-white"
        />
        {errors[key] ? <span className="font-normal text-red-300">{t("node.invalidParameter")}</span> : null}
      </label>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visible("imageCount") ? (
        <GenerationSettingsPopover label={labels("imageCount")} summary={String(values.imageCount)} icon={<Layers className="h-4 w-4" />}>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-semibold text-white/70">{labels("imageCount")}</span>
            <div className="flex items-center gap-2">
              <AppButton type="button" variant="surface" size="icon-sm" onClick={() => stepCount(-1)} aria-label={labels("decrease")}>−</AppButton>
              <span className="min-w-8 text-center text-lg font-black tabular-nums">{values.imageCount}</span>
              <AppButton type="button" variant="surface" size="icon-sm" onClick={() => stepCount(1)} aria-label={labels("increase")}>+</AppButton>
            </div>
          </div>
          <div className="mt-3">{numericField("imageCount", labels("imageCount"))}</div>
        </GenerationSettingsPopover>
      ) : null}

      {hasSize ? (
        <GenerationSettingsPopover label={labels("outputSize")} summary={`${activePreset ?? ""} ${values.width}×${values.height}`.trim()} icon={<Maximize2 className="h-4 w-4" />}>
          <div className="flex flex-wrap gap-2">
            {sizePresets.map((preset) => (
              <AppButton key={preset} type="button" variant={activePreset === preset ? "primary" : "surface"} size="sm" aria-pressed={activePreset === preset} onClick={() => applySize(preset)}>{preset}</AppButton>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {visible("width") ? numericField("width", labels("width")) : null}
            {visible("height") ? numericField("height", labels("height")) : null}
          </div>
        </GenerationSettingsPopover>
      ) : null}

      {hasAdvanced ? (
        <GenerationSettingsPopover label={labels("settings")} summary={visible("steps") ? `${labels("steps")} ${values.steps}` : labels("settings")} icon={<SlidersHorizontal className="h-4 w-4" />}>
          <div className="grid gap-4">
            {visible("modeChoice") && modeOptions.length ? (
              <label className="grid gap-1.5 text-xs font-semibold text-white/55">
                <span>{labels("modeChoice")}</span>
                <select value={values.modeChoice} onChange={(event) => publish(applyImageModeChoice(values, model, event.target.value))} className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white">
                  {modeOptions.map((option) => {
                    const value = getRuntimeParameterOptionValue(option);
                    return typeof value === "string" || typeof value === "number" ? (
                      <option key={String(value)} value={String(value)}>{getRuntimeParameterOptionLabel(option)}</option>
                    ) : null;
                  })}
                </select>
              </label>
            ) : null}
            {visible("steps") ? numericField("steps", labels("steps")) : null}
            {visible("guidanceScale") ? numericField("guidanceScale", labels("guidanceScale")) : null}
            {visible("promptUpsampling") ? (
              <label className="flex items-center justify-between gap-3 text-sm font-semibold text-white/70">
                <span>{labels("promptUpsampling")}</span>
                <input type="checkbox" checked={values.promptUpsampling} onChange={(event) => publish({ ...values, promptUpsampling: event.target.checked })} className="h-4 w-4 accent-primary" />
              </label>
            ) : null}
            {visible("seed") ? (
              <label className="grid gap-1.5 text-xs font-semibold text-white/55">
                <span>{labels("seed")}</span>
                <AppInput value={values.seed} onChange={(event) => publish({ ...values, seed: event.target.value })} className="h-10 border-white/10 bg-black/30 text-white" />
              </label>
            ) : null}
          </div>
        </GenerationSettingsPopover>
      ) : null}
    </div>
  );
}
