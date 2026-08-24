"use client";

import { useMemo, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  authoringValuesToImageConfig,
  imageConfigToAuthoringValues,
  migrateImageAuthoringValues,
} from "@/shared/generation/image-authoring";
import { resolveImageModalities } from "@/shared/model-catalog/modality";
import { AppButton } from "@/shared/ui/app-button";
import { AppTextarea } from "@/shared/ui/app-form-control";
import { AppPromptSurface } from "@/shared/ui/app-prompt-surface";
import { GenerationModelSection } from "@/shared/ui/generation-model-section";

import { useNodeAuthoring } from "../../model/node-authoring-context";
import type { ImageGenerationNodeConfigDto } from "../../model/graph-types";
import { ImageNodeParameterControls } from "./image-node-parameter-controls";

type ImageNodeAuthoringFormProps = {
  nodeId: string;
  config: ImageGenerationNodeConfigDto;
};

export function ImageNodeAuthoringForm({ nodeId, config }: ImageNodeAuthoringFormProps) {
  const t = useTranslations("nodeStudio");
  const {
    imageModels,
    isLoading,
    error,
    retry,
    updateImageNodeConfig,
  } = useNodeAuthoring();
  const [prompt, setPrompt] = useState(config.prompt);
  const promptId = `node-${nodeId}-prompt`;
  const composingRef = useRef(false);
  const resolved = useMemo(
    () => imageConfigToAuthoringValues(config, imageModels),
    [config, imageModels],
  );
  const modelOptions = useMemo(
    () =>
      imageModels.map((model) => ({
        id: model.key,
        name: model.label,
        vendor: model.vendor,
        modalities: resolveImageModalities(model.meta),
      })),
    [imageModels],
  );
  const defaultModelKey = imageModels.find((model) => model.isDefault)?.key;

  const publishPrompt = (value: string) => {
    updateImageNodeConfig(nodeId, { ...config, prompt: value });
  };

  const handleModelSelect = (modelKey: string) => {
    const model = imageModels.find((item) => item.key === modelKey);
    if (!model || model.key === config.modelKey) return;
    const values = migrateImageAuthoringValues({ prompt }, model);
    updateImageNodeConfig(
      nodeId,
      authoringValuesToImageConfig(values, model) as ImageGenerationNodeConfigDto,
    );
  };

  const selectionLabel = resolved.unavailableModelKey
    ? t("node.modelUnavailable", { model: resolved.unavailableModelKey })
    : config.modelKey
      ? undefined
      : t("node.chooseModel");

  return (
    <div className="nodrag nopan nowheel grid gap-3">
      <div className="grid gap-2 text-xs font-semibold text-white/60">
        <label htmlFor={promptId}>{t("node.promptLabel")}</label>
        <AppPromptSurface
          textarea={
            <AppTextarea
              id={promptId}
              value={prompt}
              surface="transparent"
              rows={4}
              placeholder={t("node.promptPlaceholder")}
              className="min-h-24 resize-y p-4 pb-7 text-sm leading-6 text-white"
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={(event) => {
                composingRef.current = false;
                publishPrompt(event.currentTarget.value);
              }}
              onChange={(event) => {
                const value = event.target.value;
                setPrompt(value);
                if (!composingRef.current) publishPrompt(value);
              }}
            />
          }
          promptMeta={t("node.promptChars", { count: prompt.length })}
        />
      </div>

      {isLoading ? (
        <div className="flex h-12 items-center gap-2 rounded-xl border border-white/10 bg-black/16 px-3 text-sm text-white/45">
          <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {t("node.modelLoading")}
        </div>
      ) : error ? (
        <div className="flex min-h-12 items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/5 px-3 text-sm text-red-100" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{t("node.modelError")}</span>
          <AppButton type="button" variant="ghost" size="sm" onClick={retry}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {t("actions.retry")}
          </AppButton>
        </div>
      ) : imageModels.length === 0 ? (
        <div className="flex h-12 items-center rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 text-sm text-amber-100" role="status">
          {t("node.modelEmpty")}
        </div>
      ) : (
        <GenerationModelSection
          modality="image"
          items={modelOptions}
          activeId={config.modelKey}
          defaultId={defaultModelKey}
          selectionLabel={selectionLabel}
          onSelect={handleModelSelect}
          className="w-full"
        />
      )}

      {resolved.model && resolved.values ? (
        <ImageNodeParameterControls
          key={resolved.model.key}
          model={resolved.model}
          values={{ ...resolved.values, prompt }}
          onChange={(nextConfig) => updateImageNodeConfig(nodeId, nextConfig)}
        />
      ) : null}
    </div>
  );
}
