"use client";
import { useState } from "react";
import { GradioPromptFeedback } from "@/shared/ui/gradio-prompt-feedback";
import { AppSelectRoot, AppSelectTrigger, AppSelectValue, AppSelectContent, AppSelectItem } from "@/shared/ui/app-select";
import { gradioFormError } from "@/shared/model-catalog/gradio-form-validation";
import { getGradioContract } from "@/shared/model-catalog/gradio-contract";
import { GradioContractFields } from "@/shared/ui/gradio-contract-fields";
import { useGenerationSearchParams } from "@/shared/lib/generation/query-context";

import { useCallback, useEffect, useMemo, useRef, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dice5,
  Download,
  ExternalLink,
  ImagePlus,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppForm,
  AppFormControl,
  AppFormControllerField,
  AppFormItem,
  AppFormLabel,
  AppFormMessage,
} from "@/shared/ui/app-form";
import { AppInput } from "@/shared/ui/app-input";
import { AppTextarea } from "@/shared/ui/app-form-control";
import { cn } from "@/shared/lib/utils";
import { GenerationCanvas } from "@/shared/ui/generation-canvas";
import { GenerationModelSection } from "@/shared/ui/generation-model-section";
import { GenerationPromptField } from "@/shared/ui/generation-prompt-field";
import { GenerationSettingsPopover } from "@/shared/ui/generation-settings-popover";
import { GenerationResultReveal } from "@/shared/ui/generation-result-reveal";
import { GenerationStudioIntro } from "@/shared/ui/generation-studio-intro";
import { buildLoginHref } from "@/features/auth/lib/login-redirect";
import {
  imageGenerationDefaults,
  createImageGenerationSchema,
  type ImageGenerationFormValues,
} from "@/features/image-generation/model/image-generation-schema";
import { useImageGeneration } from "@/features/image-generation/hook/use-image-generation";
import { useImageInitPreviews } from "@/features/image-generation/hook/use-image-init-previews";
import { useTranslations } from "next-intl";
import { useRuntimeModelCatalog } from "@/shared/lib/hooks/use-runtime-model-catalog";
import {
  getRuntimeParameterOptionLabel,
  getRuntimeParameterOptionValue,
} from "@/shared/model-catalog/parameter-options";
import {
  getRuntimeImageParamConfig,
  getRuntimeImageParamRange,
  resolveRuntimeDefaultModelKey,
  resolveRuntimeImageMaxInputImages,
} from "@/shared/model-catalog/runtime-utils";
import { createRuntimeImageSchema } from "@/shared/model-catalog/runtime-schema";
import { resolveImageModalities } from "@/shared/model-catalog/modality";
import {
  applyImageModeChoice,
  resolveImageAuthoringDefaults,
} from "@/shared/generation/image-authoring";

type ImageGenerationFormProps = {
  embedded?: boolean;
  isAuthenticated: boolean;
};

const studioPreviewShellClass =
  "flex flex-col items-center px-4 pb-56 sm:px-6 lg:pb-64";
const studioResultFrameClass =
  "mt-10 min-h-[18rem] w-full max-w-6xl rounded-[1.75rem] border border-white/10 bg-[#0b0d0c]/72 shadow-[0_24px_90px_rgba(0,0,0,0.46)] sm:min-h-[24rem]";

export function ImageGenerationForm({
  isAuthenticated,
  embedded = false,
}: ImageGenerationFormProps) {
  const searchParams = useGenerationSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const tGeneration = useTranslations("generation");
  const tImage = useTranslations("generation.image");
  const tActions = useTranslations("common.actions");
  const tLabels = useTranslations("common.labels");
  const tValidation = useTranslations("generation.validation.image");
  const isGuest = !isAuthenticated;
  const { imageModels: runtimeImageModels, isLoading: isModelLoading } =
    useRuntimeModelCatalog({ enabled: !isGuest });
  const resolvedImageModels = runtimeImageModels;
  const hasModels = resolvedImageModels.length > 0;
  const defaultModelKey =
    resolveRuntimeDefaultModelKey(resolvedImageModels) ?? "";
  const runtimeModelMap = useMemo(
    () => new Map(resolvedImageModels.map((model) => [model.key, model])),
    [resolvedImageModels],
  );
  const modelOptions = useMemo(
    () =>
      resolvedImageModels.map((model) => ({
        id: model.key,
        name: model.label,
        vendor: model.vendor,
        modalities: resolveImageModalities(model.meta),
      })),
    [resolvedImageModels],
  );
  const staticSchema = useMemo(
    () => createImageGenerationSchema(tValidation),
    [tValidation],
  );
  const runtimeSchema = useMemo(
    () => createRuntimeImageSchema(resolvedImageModels, tValidation),
    [resolvedImageModels, tValidation],
  );
  const resolverRef = useRef<Resolver<ImageGenerationFormValues>>(
    zodResolver(staticSchema) as unknown as Resolver<ImageGenerationFormValues>,
  );
  useEffect(() => {
    resolverRef.current = zodResolver(
      runtimeSchema,
    ) as unknown as Resolver<ImageGenerationFormValues>;
  }, [runtimeSchema]);
  const resolver = useCallback<Resolver<ImageGenerationFormValues>>(
    (values, context, options) => resolverRef.current(values, context, options),
    [],
  );
  const form = useForm<ImageGenerationFormValues>({
    resolver,
    defaultValues: imageGenerationDefaults,
    mode: "onChange",
  });
  const promptFromQuery = searchParams?.get("prompt") ?? "";
  const modelFromQuery =
    searchParams?.get("model") ??
    resolvedImageModels.find(
      (model) => model.label === searchParams?.get("modelLabel"),
    )?.key ??
    "";
  const initImagesFromQuery = useMemo(
    () =>
      (searchParams?.getAll("initImage") ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    [searchParams],
  );
  const handleLoginRedirect = useCallback(() => {
    const queryString = searchParams.toString();
    const returnTo = `${pathname}${queryString ? `?${queryString}` : ""}`;
    router.push(buildLoginHref(returnTo));
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const trimmed = promptFromQuery.trim();
    if (!trimmed) return;
    if (form.getValues("prompt") === trimmed) return;
    form.setValue("prompt", trimmed, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [promptFromQuery, form]);

  useEffect(() => {
    const trimmed = modelFromQuery.trim();
    if (!trimmed) return;
    if (!hasModels) return;
    if (!runtimeModelMap.has(trimmed)) return;
    if (form.getValues("model") === trimmed) return;
    form.setValue("model", trimmed, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [form, hasModels, modelFromQuery, runtimeModelMap]);

  const imageCount =
    useWatch({ control: form.control, name: "imageCount" }) ??
    imageGenerationDefaults.imageCount;
  const steps =
    useWatch({ control: form.control, name: "steps" }) ??
    imageGenerationDefaults.steps;
  const guidanceScale =
    useWatch({ control: form.control, name: "guidanceScale" }) ??
    imageGenerationDefaults.guidanceScale;
  const modeChoice =
    useWatch({ control: form.control, name: "modeChoice" }) ??
    imageGenerationDefaults.modeChoice;
  const watchedModel =
    useWatch({ control: form.control, name: "model" }) ??
    imageGenerationDefaults.model;
  const activeModel = hasModels
    ? runtimeModelMap.has(watchedModel)
      ? watchedModel
      : defaultModelKey
    : "";

  const activeRuntimeModel = runtimeModelMap.get(activeModel);
  const gradioContract = activeRuntimeModel ? getGradioContract(activeRuntimeModel) : null;
  const contractValues = useWatch({control: form.control, name:"dynamicParams"}) ?? {};
  const [promptWasEdited, setPromptWasEdited] = useState(false);
  const promptFeedbackSubmitted = form.formState.isSubmitted;
  const mappingPrompt = useWatch({control: form.control, name:"prompt"}) ?? "";
  const mappingInvalid = gradioContract ? gradioFormError(gradioContract, {prompt: mappingPrompt, dynamicParams: contractValues}) !== null : false;
  const widthRange = getRuntimeImageParamRange(activeRuntimeModel, "width");
  const heightRange = getRuntimeImageParamRange(activeRuntimeModel, "height");
  const stepsRange = getRuntimeImageParamRange(activeRuntimeModel, "steps");
  const imageCountRange = getRuntimeImageParamRange(
    activeRuntimeModel,
    "imageCount",
  );
  const guidanceRange = getRuntimeImageParamRange(
    activeRuntimeModel,
    "guidanceScale",
  );
  const widthConfig = getRuntimeImageParamConfig(activeRuntimeModel, "width");
  const heightConfig = getRuntimeImageParamConfig(activeRuntimeModel, "height");
  const stepsConfig = getRuntimeImageParamConfig(activeRuntimeModel, "steps");
  const modeConfig = getRuntimeImageParamConfig(
    activeRuntimeModel,
    "modeChoice",
  );
  const guidanceConfig = getRuntimeImageParamConfig(
    activeRuntimeModel,
    "guidanceScale",
  );
  const promptUpsamplingConfig = getRuntimeImageParamConfig(
    activeRuntimeModel,
    "promptUpsampling",
  );
  const seedConfig = getRuntimeImageParamConfig(activeRuntimeModel, "seed");
  const modeOptions = Array.isArray(modeConfig?.options)
    ? modeConfig.options.filter((option) => {
        const value = getRuntimeParameterOptionValue(option);
        return (
          (typeof value === "string" && value.trim().length > 0) ||
          typeof value === "number"
        );
      })
    : [];
  const showSizeControls =
    (Boolean(widthConfig) && widthConfig?.ui !== "hidden") ||
    (Boolean(heightConfig) && heightConfig?.ui !== "hidden");
  const showSteps = Boolean(stepsConfig) && stepsConfig?.ui !== "hidden";
  const showModeChoice =
    Boolean(modeConfig) &&
    modeConfig?.ui !== "hidden" &&
    modeOptions.length > 0;
  const showGuidanceScale =
    Boolean(guidanceConfig) && guidanceConfig?.ui !== "hidden";
  const showPromptUpsampling =
    Boolean(promptUpsamplingConfig) && promptUpsamplingConfig?.ui !== "hidden";
  const showSeed = Boolean(seedConfig) && seedConfig?.ui !== "hidden";
  const maxInputImages = resolveRuntimeImageMaxInputImages(activeRuntimeModel);
  const prevModeChoiceRef = useRef<string | null>(null);
  const hasInjectedInitImagesRef = useRef(false);
  const handleInitImagesChange = useCallback(
    (dataUrls: string[]) => {
      form.setValue("initImages", dataUrls, { shouldValidate: true });
    },
    [form],
  );
  const {
    previews: initImagePreviews,
    canUpload: canUploadImages,
    inputRef: fileInputRef,
    openPicker: handleOpenImagePicker,
    handleFileChange: handleImageSelection,
    replaceImages: replaceInitImages,
    removeImage: handleRemoveInitImage,
  } = useImageInitPreviews({
    maxInputImages,
    onChange: handleInitImagesChange,
  });

  useEffect(() => {
    if (hasInjectedInitImagesRef.current) return;
    if (initImagesFromQuery.length === 0) return;

    const trimmedModel = modelFromQuery.trim();
    if (
      trimmedModel &&
      hasModels &&
      runtimeModelMap.has(trimmedModel) &&
      activeModel !== trimmedModel
    ) {
      return;
    }

    if (maxInputImages <= 0) return;

    replaceInitImages(initImagesFromQuery.slice(0, maxInputImages));
    hasInjectedInitImagesRef.current = true;
  }, [
    activeModel,
    hasModels,
    initImagesFromQuery,
    maxInputImages,
    modelFromQuery,
    replaceInitImages,
    runtimeModelMap,
  ]);

  useEffect(() => {
    if (!hasModels || !defaultModelKey) return;
    const currentModel = form.getValues("model");
    if (runtimeModelMap.has(currentModel)) return;
    form.setValue("model", defaultModelKey, { shouldValidate: true });
  }, [defaultModelKey, form, hasModels, runtimeModelMap]);

  useEffect(() => {
    const model = runtimeModelMap.get(activeModel);
    if (!model) return;
    if (getGradioContract(model)) {
      const current = form.getValues();
      form.reset({ model: activeModel, prompt: current.prompt ?? "", dynamicParams: current.dynamicParams ?? {}, initImages: current.initImages });
      return;
    }
    const defaults = resolveImageAuthoringDefaults(model);
    form.setValue("steps", defaults.steps);
    form.setValue("width", defaults.width);
    form.setValue("height", defaults.height);
    form.setValue("guidanceScale", defaults.guidanceScale);
    form.setValue("modeChoice", defaults.modeChoice);
    form.setValue("promptUpsampling", defaults.promptUpsampling);
    prevModeChoiceRef.current = null;

    const seedCfg = getRuntimeImageParamConfig(model, "seed");
    if (seedCfg?.ui === "hidden") {
      form.setValue("seed", "");
    }
  }, [activeModel, form, runtimeModelMap]);

  const appliedLandingSettings = useRef(false);
  useEffect(() => {
    if (
      appliedLandingSettings.current ||
      searchParams.get("source") !== "landing" ||
      !activeRuntimeModel ||
      (modelFromQuery && activeModel !== modelFromQuery)
    )
      return;
    appliedLandingSettings.current = true;
    for (const [name, range] of [
      ["width", widthRange],
      ["height", heightRange],
      ["steps", stepsRange],
      ["imageCount", imageCountRange],
    ] as const) {
      const value = Number(searchParams.get(name));
      if (!Number.isFinite(value) || value <= 0) continue;
      const bounded = Math.min(
        range.max,
        Math.max(
          range.min,
          Math.round(value / Math.max(1, range.step)) * Math.max(1, range.step),
        ),
      );
      form.setValue(name, bounded, { shouldValidate: true });
    }
  }, [
    activeRuntimeModel,
    activeModel,
    modelFromQuery,
    searchParams,
    form,
    widthRange,
    heightRange,
    stepsRange,
    imageCountRange,
  ]);

  useEffect(() => {
    if (!showModeChoice) return;
    const current = modeChoice?.trim();
    if (!current) return;
    if (prevModeChoiceRef.current === current) return;
    prevModeChoiceRef.current = current;

    if (!activeRuntimeModel) return;
    const currentValues = form.getValues();
    const adjusted = applyImageModeChoice(
      {
        prompt: currentValues.prompt,
        model: currentValues.model,
        width: currentValues.width,
        height: currentValues.height,
        imageCount: currentValues.imageCount,
        steps: currentValues.steps,
        modeChoice: currentValues.modeChoice ?? "",
        guidanceScale: currentValues.guidanceScale ?? 1,
        promptUpsampling: currentValues.promptUpsampling ?? false,
        seed: currentValues.seed ?? "",
      },
      activeRuntimeModel,
      current,
    );
    form.setValue("steps", adjusted.steps, { shouldValidate: true });
    form.setValue("guidanceScale", adjusted.guidanceScale, {
      shouldValidate: true,
    });
  }, [form, activeRuntimeModel, modeChoice, showModeChoice]);

  const { state, startGeneration, reset } = useImageGeneration(activeRuntimeModel?.provider==="modal_comfyui" ? Number(activeRuntimeModel.providerConfig?.timeout_ms??900_000) : undefined);
  const isGenerating =
    state.status === "pending" ||
    state.status === "processing" ||
    state.status === "uploading";
  const resultImages = state.result?.images ?? [];
  const hasResults = state.status === "completed" && resultImages.length > 0;

  const handleSelectModel = (modelId: string) => {
    if (modelId === activeModel) return;
    if (isGenerating) {
      reset();
    }
    form.setValue("dynamicParams", {});
    form.setValue("model", modelId, { shouldValidate: true });
  };

  const handleRandomizeSeed = () => {
    if (isGenerating) return;
    let seedValue = Math.floor(Math.random() * 1_000_000_000);
    if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      seedValue = buffer[0] ?? seedValue;
    }
    form.setValue("seed", String(seedValue), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleImageCountStep = (direction: 1 | -1) => {
    if (isGenerating) return;
    const nextValue = Math.min(
      imageCountRange.max,
      Math.max(
        imageCountRange.min,
        imageCount + direction * Math.max(imageCountRange.step, 1),
      ),
    );
    form.setValue("imageCount", nextValue, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const resultsGridClass =
    resultImages.length <= 1
      ? "grid-cols-1"
      : resultImages.length === 2
        ? "grid-cols-2"
        : "grid-cols-2 lg:grid-cols-3";

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!isAuthenticated) {
      event.preventDefault();
      handleLoginRedirect();
      return;
    }
    if (isModelLoading || !hasModels) {
      event.preventDefault();
      return;
    }

    if (mappingInvalid) { setPromptWasEdited(true); form.setValue("prompt", mappingPrompt, {shouldTouch:true}); event.preventDefault(); return; }
    void form.handleSubmit((values) => startGeneration(values))(event);
  };
  return (
    <AppForm {...form}>
      <form
        className={
          embedded
            ? "generation-embedded"
            : "mx-auto flex w-full max-w-[1600px] flex-col gap-8 pb-36"
        }
        onSubmit={handleFormSubmit}
      >
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-6">
            <GenerationResultReveal visible={!embedded || isGenerating || hasResults || state.status === "failed"} className={embedded ? "generation-result" : studioPreviewShellClass}>
              {!embedded && (<GenerationStudioIntro
                compact={embedded}
                guidance={tGeneration("page.imageGuidance")}
                eyebrow={tImage("previewEyebrow")}
                title={tImage("previewTitle")}
                description={tImage("previewDescription")}
              />)}
              <GenerationCanvas
                isGenerating={isGenerating}
                status={state.status}
                errorMessage={state.errorMessage}
                className={
                  embedded
                    ? "mx-auto w-full max-w-[400px] aspect-square rounded-xl border bg-card"
                    : studioResultFrameClass
                }
              >
                {hasResults ? (
                  <div
                    className={cn(
                      "relative z-10 grid h-full w-full gap-3 p-4",
                      resultsGridClass,
                    )}
                  >
                    {resultImages.map((image, index) => {
                      const downloadUrl = state.requestId
                        ? `/api/image-generation/${state.requestId}/download?index=${index}`
                        : image.url;

                      return (
                        <div
                          key={`${image.url}-${index}`}
                          className="group/result relative overflow-hidden rounded-xl border border-white/10 bg-surface-dark"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={image.url}
                            alt={tImage("generatedImageAlt", {
                              index: index + 1,
                            })}
                            className="h-full w-full object-contain transition-transform duration-500 group-hover/result:scale-105"
                          />
                          <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent opacity-0 transition-opacity group-hover/result:opacity-100" />
                          <div className="absolute bottom-3 right-3 flex gap-2 opacity-0 transition-opacity group-hover/result:opacity-100">
                            <AppButton asChild variant="surface" size="icon-sm">
                              <a
                                href={image.url}
                                target="_blank"
                                rel="noreferrer"
                                title={tActions("open")}
                                aria-label={tActions("open")}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </AppButton>
                            <AppButton asChild variant="surface" size="icon-sm">
                              <a
                                href={downloadUrl}
                                download
                                title={tActions("download")}
                                aria-label={tActions("download")}
                              >
                                <Download className="h-4 w-4" />
                              </a>
                            </AppButton>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div aria-hidden="true" className="h-full w-full" />
                )}
              </GenerationCanvas>
            </GenerationResultReveal>

            {hasResults && state.errorMessage && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                {state.errorMessage}
              </div>
            )}

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4">
                <AppFormControllerField
                  control={form.control}
                  name="prompt"
                  render={({ field, fieldState }) => (
                    <AppFormItem className="flex-1">
                      <GenerationPromptField
                        ariaLabel={tGeneration("promptDock.label")}
                        surface="hero"
                        className={
                          embedded
                            ? "generation-composer"
                            : "fixed inset-x-4 bottom-5 z-40 mx-auto max-w-6xl"
                        }
                        textarea={
                          <AppFormControl>
                            <AppTextarea
                              surface="transparent"
                              className="min-h-[160px]"
                              placeholder={tImage("promptPlaceholder")}
                              {...field}
 onChange={event=>{setPromptWasEdited(true);field.onChange(event);}}
                            />
                          </AppFormControl>
                        }
                        feedback={
                          gradioContract && !mappingPrompt.trim() && ((fieldState.isTouched && promptWasEdited) || promptFeedbackSubmitted) ? <GradioPromptFeedback contract={gradioContract}/> : fieldState.error && ((fieldState.isTouched && promptWasEdited) || promptFeedbackSubmitted) ? (
                            <AppFormMessage className="text-xs text-red-400" />
                          ) : undefined
                        }
                        attachments={gradioContract ? undefined : (
                          <div className="flex flex-wrap items-start gap-2 px-4 pt-4">
                            {initImagePreviews.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {initImagePreviews.map((item) => (
                                  <div
                                    key={item.id}
                                    className="group relative h-14 w-14 overflow-hidden rounded-lg border border-white/10 bg-black/40"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={item.url}
                                      alt={tImage("initImageAlt")}
                                      className="h-full w-full object-cover"
                                    />
                                    <AppButton
                                      type="button"
                                      onClick={() =>
                                        handleRemoveInitImage(item.id)
                                      }
                                      variant="ghost"
                                      size="icon-sm"
                                      className="absolute right-1 top-1 h-5 w-5 rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
                                      title={tActions("remove")}
                                    >
                                      <X className="h-3 w-3" />
                                    </AppButton>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            <AppButton
                              type="button"
                              variant="surface"
                              size="icon"
                              onClick={handleOpenImagePicker}
                              disabled={
                                !canUploadImages ||
                                initImagePreviews.length >= maxInputImages
                              }

                              title={
                                canUploadImages
                                  ? tImage("uploadReference")
                                  : tImage("uploadUnsupported")
                              }
                            >
                              <ImagePlus className="h-5 w-5" />
                            </AppButton>
                          </div>
                        )}
footerLeft={gradioContract ? <>
<GenerationModelSection modality="image" items={modelOptions} activeId={activeModel} onSelect={handleSelectModel} />
<GenerationSettingsPopover onBlockedOpen={isGuest ? handleLoginRedirect : undefined} disabled={!gradioContract.inputs.some(f => !f.canonical && !f.hidden)} label={tLabels("advancedOptions")} summary={tLabels("advancedOptions")} icon={<SlidersHorizontal className="h-4 w-4" />}><GradioContractFields key={activeModel} contract={gradioContract} values={contractValues} prompt={mappingPrompt} onChange={values=>form.setValue("dynamicParams",values,{shouldValidate:true})}/></GenerationSettingsPopover>
</> : (
                          <>
                            {!isGuest && hasModels ? (
                              <GenerationModelSection
                                modality="image"
                                items={modelOptions}
                                activeId={activeModel}
                                onSelect={handleSelectModel}
                              />
                            ) : (
                              <GenerationModelSection modality="image" items={[]} activeId={null} onSelect={() => {}} disabled loading={isModelLoading} selectionLabel={isGuest ? tGeneration("modelLoginRequired") : tGeneration("modelUnavailable")} />
                            )}
<GenerationSettingsPopover onBlockedOpen={isGuest ? handleLoginRedirect : undefined} disabled={!(showSizeControls || showModeChoice || showSteps || showGuidanceScale || showPromptUpsampling || showSeed || (getRuntimeImageParamConfig(activeRuntimeModel, "imageCount")?.ui !== "hidden" && imageCountRange.min !== imageCountRange.max))} label={tLabels("advancedOptions")} summary={tLabels("advancedOptions")} icon={<SlidersHorizontal className="h-4 w-4" />}><div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto p-1">
                            {showSizeControls ? (
                              <div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                  {widthConfig?.ui !== "hidden" ? (
                                    <AppFormControllerField
                                      control={form.control}
                                      name="width"
                                      render={({ field }) => (
                                        <AppFormItem>
                                          <AppFormLabel className="text-xs font-bold text-gray-500">
                                            {tLabels("width")}
                                          </AppFormLabel>
                                          <AppFormControl>
                                            <AppInput
                                              type="number"
                                              min={widthRange.min}
                                              max={widthRange.max}
                                              step={widthRange.step}
                                              value={field.value}
                                              onChange={(event) =>
                                                field.onChange(
                                                  Number(event.target.value),
                                                )
                                              }
                                              className="h-11 border-white/10 bg-black/30 text-white"
                                            />
                                          </AppFormControl>
                                        </AppFormItem>
                                      )}
                                    />
                                  ) : null}
                                  {heightConfig?.ui !== "hidden" ? (
                                    <AppFormControllerField
                                      control={form.control}
                                      name="height"
                                      render={({ field }) => (
                                        <AppFormItem>
                                          <AppFormLabel className="text-xs font-bold text-gray-500">
                                            {tLabels("height")}
                                          </AppFormLabel>
                                          <AppFormControl>
                                            <AppInput
                                              type="number"
                                              min={heightRange.min}
                                              max={heightRange.max}
                                              step={heightRange.step}
                                              value={field.value}
                                              onChange={(event) =>
                                                field.onChange(
                                                  Number(event.target.value),
                                                )
                                              }
                                              className="h-11 border-white/10 bg-black/30 text-white"
                                            />
                                          </AppFormControl>
                                        </AppFormItem>
                                      )}
                                    />
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                            {getRuntimeImageParamConfig(activeRuntimeModel, "imageCount")?.ui !== "hidden" && imageCountRange.min !== imageCountRange.max ? <div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-semibold text-gray-300">
                                  {tLabels("imageCount")}
                                </span>
                                <div className="flex items-center gap-2">
                                  <AppButton
                                    type="button"
                                    variant="surface"
                                    size="icon-sm"
                                    onClick={() => handleImageCountStep(-1)}
                                    disabled={
                                      imageCount <= imageCountRange.min ||
                                      isGenerating
                                    }
                                    aria-label={tLabels("decrease")}
                                  >
                                    -
                                  </AppButton>
                                  <span className="min-w-8 text-center text-lg font-black text-white">
                                    {imageCount}
                                  </span>
                                  <AppButton
                                    type="button"
                                    variant="surface"
                                    size="icon-sm"
                                    onClick={() => handleImageCountStep(1)}
                                    disabled={
                                      imageCount >= imageCountRange.max ||
                                      isGenerating
                                    }
                                    aria-label={tLabels("increase")}
                                  >
                                    +
                                  </AppButton>
                                </div>
                              </div>
                            </div> : null}
                            {showModeChoice ||
                            showSteps ||
                            showGuidanceScale ||
                            showPromptUpsampling ||
                            showSeed ? (
                              <div>
                                <div className="flex flex-col gap-5">
                                  {showModeChoice ? (
                                    <AppFormControllerField
                                      control={form.control}
                                      name="modeChoice"
                                      render={({ field }) => (
                                        <AppFormItem className="flex flex-col gap-2">
                                          <AppFormLabel className="text-xs font-bold text-gray-500">
                                            {tLabels("modeChoice")}
                                          </AppFormLabel>
                                          <AppFormControl>
                                            <AppSelectRoot value={field.value ?? ""} onValueChange={field.onChange}><AppSelectTrigger aria-label={tLabels("modeChoice")} className="w-full"><AppSelectValue /></AppSelectTrigger><AppSelectContent position="popper">
                                              {modeOptions.map((option) => {
                                                const optionValue = String(
                                                  getRuntimeParameterOptionValue(
                                                    option,
                                                  ),
                                                );
                                                return (
                                                  <AppSelectItem
                                                    key={optionValue}
                                                    value={optionValue}
                                                  >
                                                    {getRuntimeParameterOptionLabel(
                                                      option,
                                                    )}
                                                  </AppSelectItem>
                                                );
                                              })}
                                            </AppSelectContent></AppSelectRoot>
                                          </AppFormControl>
                                        </AppFormItem>
                                      )}
                                    />
                                  ) : null}
                                  {showSteps ? (
                                    <AppFormControllerField
                                      control={form.control}
                                      name="steps"
                                      render={({ field }) => (
                                        <AppFormItem className="flex flex-col gap-2">
                                          <div className="flex items-center justify-between">
                                            <AppFormLabel className="text-xs font-bold text-gray-500">
                                              {tLabels("steps")}
                                            </AppFormLabel>
                                            <span className="text-sm font-bold text-white">
                                              {steps}
                                            </span>
                                          </div>
                                          <AppFormControl>
                                            <input
                                              type="range"
                                              min={stepsRange.min}
                                              max={stepsRange.max}
                                              step={stepsRange.step}
                                              value={field.value}
                                              onChange={(event) =>
                                                field.onChange(
                                                  Number(event.target.value),
                                                )
                                              }
                                              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/15"
                                            />
                                          </AppFormControl>
                                        </AppFormItem>
                                      )}
                                    />
                                  ) : null}
                                  {showGuidanceScale ? (
                                    <AppFormControllerField
                                      control={form.control}
                                      name="guidanceScale"
                                      render={({ field }) => (
                                        <AppFormItem className="flex flex-col gap-2">
                                          <div className="flex items-center justify-between">
                                            <AppFormLabel className="text-xs font-bold text-gray-500">
                                              {tLabels("guidanceScale")}
                                            </AppFormLabel>
                                            <span className="text-sm font-bold text-white">
                                              {guidanceScale}
                                            </span>
                                          </div>
                                          <AppFormControl>
                                            <input
                                              type="range"
                                              min={guidanceRange.min}
                                              max={guidanceRange.max}
                                              step={guidanceRange.step}
                                              value={
                                                field.value ?? guidanceScale
                                              }
                                              onChange={(event) =>
                                                field.onChange(
                                                  Number(event.target.value),
                                                )
                                              }
                                              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/15"
                                            />
                                          </AppFormControl>
                                        </AppFormItem>
                                      )}
                                    />
                                  ) : null}
                                  {showPromptUpsampling ? (
                                    <AppFormControllerField
                                      control={form.control}
                                      name="promptUpsampling"
                                      render={({ field }) => {
                                        const isEnabled = Boolean(field.value);
                                        return (
                                          <AppFormItem className="flex items-center justify-between gap-3">
                                            <AppFormLabel className="text-xs font-bold text-gray-500">
                                              {tLabels("promptUpsampling")}
                                            </AppFormLabel>
                                            <AppFormControl>
                                              <AppButton
                                                type="button"
                                                variant={
                                                  isEnabled
                                                    ? "primary"
                                                    : "surface"
                                                }
                                                size="sm"
                                                onClick={() =>
                                                  field.onChange(!isEnabled)
                                                }
                                                className={cn(
                                                  "text-xs font-bold",
                                                  isEnabled
                                                    ? "text-black"
                                                    : "text-gray-300",
                                                )}
                                                aria-pressed={isEnabled}
                                              >
                                                {isEnabled
                                                  ? tLabels("enabled")
                                                  : tLabels("disabled")}
                                              </AppButton>
                                            </AppFormControl>
                                          </AppFormItem>
                                        );
                                      }}
                                    />
                                  ) : null}
                                  {showSeed ? (
                                    <AppFormControllerField
                                      control={form.control}
                                      name="seed"
                                      render={({ field }) => (
                                        <AppFormItem className="flex flex-col gap-2">
                                          <AppFormLabel className="text-xs font-bold text-gray-500">
                                            {tLabels("seed")}
                                          </AppFormLabel>
                                          <AppFormControl>
                                            <div className="flex items-center gap-2">
                                              <AppInput
                                                type="number" step={seedConfig?.step ?? 1} min={seedConfig?.min} max={seedConfig?.max}
                                                placeholder={tImage(
                                                  "seedPlaceholder",
                                                )}
                                                {...field}
                                              />
                                              <AppButton
                                                type="button"
                                                variant="surface"
                                                size="icon"
                                                onClick={handleRandomizeSeed}
                                                disabled={isGenerating}
                                                aria-label={tLabels(
                                                  "randomize",
                                                )}
                                              >
                                                <Dice5 className="h-4 w-4" />
                                              </AppButton>
                                            </div>
                                          </AppFormControl>
                                        </AppFormItem>
                                      )}
                                    />
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
</div></GenerationSettingsPopover>
                          </>
                        )}
footerRight={
                          <>
                            <AppButton
                              variant="generate"
                              isLoading={isGenerating}
                              loadingText=""
                              aria-label={isGenerating ? tActions("generating") : undefined}
                              type={isAuthenticated ? "submit" : "button"}
                              size="xl"
                              disabled={
                                isGenerating ||
                                (isAuthenticated &&
                                  (isModelLoading || !hasModels || mappingInvalid || (!gradioContract && !form.formState.isValid) || (!gradioContract && !mappingPrompt.trim())))
                              }
                              className="min-w-24"
                              onClick={
                                isAuthenticated
                                  ? undefined
                                  : handleLoginRedirect
                              }
                            >
                              {tActions("generate")}
                              <Sparkles className="h-5 w-5" />
                            </AppButton>
                          </>
                        }
                      />
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple={maxInputImages > 1}
                        className="hidden"
                        onChange={handleImageSelection}
                      />
                    </AppFormItem>
                  )}
                />
              </div>
            </div>
          </div>
        </div>
      </form>
    </AppForm>
  );
}
