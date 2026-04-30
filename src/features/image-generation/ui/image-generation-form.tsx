"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dice5,
  Download,
  ExternalLink,
  ImagePlus,
  Layers,
  Maximize2,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { AppButton } from "@/shared/ui/app-button";
import { Button } from "@/shared/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/ui/form";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { cn } from "@/shared/lib/utils";
import { GenerationCanvas } from "@/shared/ui/generation-canvas";
import { GenerationModelSection } from "@/shared/ui/generation-model-section";
import { GenerationPromptField } from "@/shared/ui/generation-prompt-field";
import { GenerationSettingsPopover } from "@/shared/ui/generation-settings-popover";
import { GenerationStudioIntro } from "@/shared/ui/generation-studio-intro";
import { LoginGateDialog } from "@/features/auth/ui/login-gate-dialog";
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
  resolveRuntimeImageDefaults,
  resolveRuntimeImageMaxInputImages,
} from "@/shared/model-catalog/runtime-utils";
import { createRuntimeImageSchema } from "@/shared/model-catalog/runtime-schema";
import { resolveImageModalities } from "@/shared/model-catalog/modality";

type ImageGenerationFormProps = {
  isAuthenticated: boolean;
};

const dockChipClass =
  "inline-flex h-12 items-center gap-2 rounded-xl border border-white/12 bg-black/16 px-3 text-sm font-medium text-white/82";
const studioPreviewShellClass =
  "flex flex-col items-center px-4 pb-56 sm:px-6 lg:pb-64";
const studioResultFrameClass =
  "mt-10 min-h-[18rem] w-full max-w-6xl rounded-[1.75rem] border border-white/10 bg-[#0b0d0c]/72 shadow-[0_24px_90px_rgba(0,0,0,0.46)] sm:min-h-[24rem]";

export function ImageGenerationForm({ isAuthenticated }: ImageGenerationFormProps) {
  const searchParams = useSearchParams();
  const tGeneration = useTranslations("generation");
  const tImage = useTranslations("generation.image");
  const tActions = useTranslations("common.actions");
  const tLabels = useTranslations("common.labels");
  const tValidation = useTranslations("generation.validation.image");
  const tLoginGate = useTranslations("auth.loginGate");
  const isGuest = !isAuthenticated;
  const { imageModels: runtimeImageModels, isLoading: isModelLoading } =
    useRuntimeModelCatalog({ enabled: !isGuest });
  const resolvedImageModels = runtimeImageModels;
  const hasModels = resolvedImageModels.length > 0;
  const defaultModelKey = resolveRuntimeDefaultModelKey(resolvedImageModels) ?? "";
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
    zodResolver(staticSchema) as Resolver<ImageGenerationFormValues>,
  );
  useEffect(() => {
    resolverRef.current = zodResolver(runtimeSchema) as Resolver<ImageGenerationFormValues>;
  }, [runtimeSchema]);
  const resolver = useCallback<Resolver<ImageGenerationFormValues>>(
    (values, context, options) =>
      resolverRef.current(values, context, options),
    [],
  );
  const form = useForm<ImageGenerationFormValues>({
    resolver,
    defaultValues: imageGenerationDefaults,
    mode: "onChange",
  });
  const [isLoginGateOpen, setIsLoginGateOpen] = useState(false);

  const promptFromQuery = searchParams?.get("prompt") ?? "";
  const modelFromQuery = searchParams?.get("model") ?? "";
  const initImagesFromQuery = useMemo(
    () =>
      (searchParams?.getAll("initImage") ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    [searchParams],
  );
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

  const promptValue = useWatch({ control: form.control, name: "prompt" }) ?? "";
  const width =
    useWatch({ control: form.control, name: "width" }) ??
    imageGenerationDefaults.width;
  const height =
    useWatch({ control: form.control, name: "height" }) ??
    imageGenerationDefaults.height;
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
  const modeConfig = getRuntimeImageParamConfig(activeRuntimeModel, "modeChoice");
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
    Boolean(modeConfig) && modeConfig?.ui !== "hidden" && modeOptions.length > 0;
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
    const defaults = resolveRuntimeImageDefaults(model);
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

  useEffect(() => {
    if (!showModeChoice) return;
    const current = modeChoice?.trim();
    if (!current) return;
    if (prevModeChoiceRef.current === current) return;
    prevModeChoiceRef.current = current;

    const normalized = current.toLowerCase();
    const targetSteps = normalized.includes("base") ? 50 : 4;
    const clampedSteps = Math.min(
      stepsRange.max,
      Math.max(stepsRange.min, targetSteps),
    );
    form.setValue("steps", clampedSteps, { shouldValidate: true });

    const targetGuidance = 1;
    const clampedGuidance = Math.min(
      guidanceRange.max,
      Math.max(guidanceRange.min, targetGuidance),
    );
    form.setValue("guidanceScale", clampedGuidance, { shouldValidate: true });
  }, [
    form,
    guidanceRange.max,
    guidanceRange.min,
    modeChoice,
    showModeChoice,
    stepsRange.max,
    stepsRange.min,
  ]);

  const { state, startGeneration, reset } = useImageGeneration();
  const isGenerating =
    state.status === "pending" || state.status === "processing";
  const resultImages = state.result?.images ?? [];
  const hasResults = state.status === "completed" && resultImages.length > 0;

  const handleSelectModel = (modelId: string) => {
    if (modelId === activeModel) return;
    if (isGenerating) {
      reset();
    }
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
      setIsLoginGateOpen(true);
      return;
    }
    if (isModelLoading || !hasModels) {
      event.preventDefault();
      return;
    }

    void form.handleSubmit((values) => startGeneration(values))(event);
  };
  return (
    <Form {...form}>
      <form
        className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 pb-36"
        onSubmit={handleFormSubmit}
      >
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-6">
            <div className={studioPreviewShellClass}>
              <GenerationStudioIntro
                eyebrow={tImage("previewEyebrow")}
                title={tImage("previewTitle")}
                description={tImage("previewDescription")}
              />
              <GenerationCanvas
                isGenerating={isGenerating}
                status={state.status}
                errorMessage={state.errorMessage}
                className={studioResultFrameClass}
              >
                {hasResults ? (
                  <div
                    className={cn(
                      "relative z-10 grid h-full w-full gap-3 p-4",
                      resultsGridClass
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
                            alt={tImage("generatedImageAlt", { index: index + 1 })}
                            className="h-full w-full object-contain transition-transform duration-500 group-hover/result:scale-105"
                          />
                          <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent opacity-0 transition-opacity group-hover/result:opacity-100" />
                          <div className="absolute bottom-3 right-3 flex gap-2 opacity-0 transition-opacity group-hover/result:opacity-100">
                            <a
                              href={image.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-surface-dark/80 text-gray-200 transition-colors hover:border-primary hover:text-white"
                              title={tActions("open")}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                            <a
                              href={downloadUrl}
                              download
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-surface-dark/80 text-gray-200 transition-colors hover:border-primary hover:text-white"
                              title={tActions("download")}
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div aria-hidden="true" className="h-full w-full" />
                )}
              </GenerationCanvas>
            </div>

            {hasResults && state.errorMessage && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                {state.errorMessage}
              </div>
            )}

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4">
                <FormField
                  control={form.control}
                  name="prompt"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <GenerationPromptField
                        ariaLabel={tGeneration("promptDock.label")}
                        className="fixed inset-x-4 bottom-5 z-40 mx-auto max-w-6xl"
                        textarea={
                          <FormControl>
                            <Textarea
                              className="min-h-[104px] border-none bg-transparent px-5 pb-9 pt-5 text-base text-white placeholder:text-gray-500 focus-visible:ring-0"
                              {...field}
                            />
                          </FormControl>
                        }
                        promptMeta={tLabels("chars", {
                          count: promptValue.length,
                        })}
                        attachments={
                          initImagePreviews.length > 0 ? (
                            <div className="flex flex-wrap gap-2 px-4 pb-3">
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
                                  <Button
                                    type="button"
                                    onClick={() => handleRemoveInitImage(item.id)}
                                    variant="ghost"
                                    size="icon-sm"
                                    className="absolute right-1 top-1 h-5 w-5 rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
                                    title={tActions("remove")}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : null
                        }
                        footerLeft={
                          <>
                            <AppButton
                              type="button"
                              variant="surface"
                              size="icon"
                              onClick={handleOpenImagePicker}
                              disabled={
                                !canUploadImages ||
                                initImagePreviews.length >= maxInputImages
                              }
                              className="h-12 w-12 rounded-xl border-primary/20 bg-black/16 text-white hover:border-primary/20 hover:bg-black/16 hover:text-white"
                              title={
                                canUploadImages
                                  ? tImage("uploadReference")
                                  : tImage("uploadUnsupported")
                              }
                            >
                              <ImagePlus className="h-5 w-5" />
                            </AppButton>
                            {!isGuest && hasModels ? (
                              <GenerationModelSection
                                modality="image"
                                items={modelOptions}
                                activeId={activeModel}
                                onSelect={handleSelectModel}
                              />
                            ) : (
                              <button
                                type="button"
                                disabled
                                className={cn(
                                  dockChipClass,
                                  "min-w-[13rem] max-w-[13rem] cursor-not-allowed justify-between opacity-70",
                                )}
                              >
                                <span className="min-w-0 flex flex-col items-start leading-tight">
                                  <span className="text-[10px] font-semibold uppercase text-white/42">
                                    {tGeneration("modelSelect")}
                                  </span>
                                  <span className="max-w-[13rem] truncate font-medium">
                                    {isModelLoading
                                      ? tGeneration("modelLoading")
                                      : isGuest
                                        ? tGeneration("modelLoginRequired")
                                        : tGeneration("modelUnavailable")}
                                  </span>
                                </span>
                              </button>
                            )}
                            {showSizeControls ? (
                              <GenerationSettingsPopover
                                label={tLabels("outputSize")}
                                summary={`${width} × ${height}`}
                                icon={<Maximize2 className="h-4 w-4" />}
                              >
                                <div className="grid gap-4 sm:grid-cols-2">
                                  {widthConfig?.ui !== "hidden" ? (
                                    <FormField
                                      control={form.control}
                                      name="width"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs font-bold text-gray-500">
                                            {tLabels("width")}
                                          </FormLabel>
                                          <FormControl>
                                            <Input
                                              type="number"
                                              min={widthRange.min}
                                              max={widthRange.max}
                                              step={widthRange.step}
                                              value={field.value}
                                              onChange={(event) =>
                                                field.onChange(Number(event.target.value))
                                              }
                                              className="h-11 border-white/10 bg-black/30 text-white"
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  ) : null}
                                  {heightConfig?.ui !== "hidden" ? (
                                    <FormField
                                      control={form.control}
                                      name="height"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-xs font-bold text-gray-500">
                                            {tLabels("height")}
                                          </FormLabel>
                                          <FormControl>
                                            <Input
                                              type="number"
                                              min={heightRange.min}
                                              max={heightRange.max}
                                              step={heightRange.step}
                                              value={field.value}
                                              onChange={(event) =>
                                                field.onChange(Number(event.target.value))
                                              }
                                              className="h-11 border-white/10 bg-black/30 text-white"
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  ) : null}
                                </div>
                              </GenerationSettingsPopover>
                            ) : null}
                            <GenerationSettingsPopover
                              label={tLabels("imageCount")}
                              summary={`${imageCount}`}
                              icon={<Layers className="h-4 w-4" />}
                            >
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
                            </GenerationSettingsPopover>
                            {showModeChoice ||
                            showSteps ||
                            showGuidanceScale ||
                            showPromptUpsampling ||
                            showSeed ? (
                              <GenerationSettingsPopover
                                label={tLabels("settings")}
                                summary={
                                  showSteps
                                    ? `${tLabels("steps")} ${steps}`
                                    : tLabels("settings")
                                }
                                icon={<SlidersHorizontal className="h-4 w-4" />}
                              >
                                <div className="flex flex-col gap-5">
                                  {showModeChoice ? (
                                    <FormField
                                      control={form.control}
                                      name="modeChoice"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-col gap-2">
                                          <FormLabel className="text-xs font-bold text-gray-500">
                                            {tLabels("modeChoice")}
                                          </FormLabel>
                                          <FormControl>
                                            <select
                                              value={field.value ?? ""}
                                              onChange={field.onChange}
                                              className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm font-semibold text-white"
                                            >
                                              {modeOptions.map((option) => {
                                                const optionValue = String(
                                                  getRuntimeParameterOptionValue(option),
                                                );
                                                return (
                                                  <option
                                                    key={optionValue}
                                                    value={optionValue}
                                                  >
                                                    {getRuntimeParameterOptionLabel(option)}
                                                  </option>
                                                );
                                              })}
                                            </select>
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  ) : null}
                                  {showSteps ? (
                                    <FormField
                                      control={form.control}
                                      name="steps"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-col gap-2">
                                          <div className="flex items-center justify-between">
                                            <FormLabel className="text-xs font-bold text-gray-500">
                                              {tLabels("steps")}
                                            </FormLabel>
                                            <span className="text-sm font-bold text-white">
                                              {steps}
                                            </span>
                                          </div>
                                          <FormControl>
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
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  ) : null}
                                  {showGuidanceScale ? (
                                    <FormField
                                      control={form.control}
                                      name="guidanceScale"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-col gap-2">
                                          <div className="flex items-center justify-between">
                                            <FormLabel className="text-xs font-bold text-gray-500">
                                              {tLabels("guidanceScale")}
                                            </FormLabel>
                                            <span className="text-sm font-bold text-white">
                                              {guidanceScale}
                                            </span>
                                          </div>
                                          <FormControl>
                                            <input
                                              type="range"
                                              min={guidanceRange.min}
                                              max={guidanceRange.max}
                                              step={guidanceRange.step}
                                              value={field.value ?? guidanceScale}
                                              onChange={(event) =>
                                                field.onChange(
                                                  Number(event.target.value),
                                                )
                                              }
                                              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/15"
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  ) : null}
                                  {showPromptUpsampling ? (
                                    <FormField
                                      control={form.control}
                                      name="promptUpsampling"
                                      render={({ field }) => {
                                        const isEnabled = Boolean(field.value);
                                        return (
                                          <FormItem className="flex items-center justify-between gap-3">
                                            <FormLabel className="text-xs font-bold text-gray-500">
                                              {tLabels("promptUpsampling")}
                                            </FormLabel>
                                            <FormControl>
                                              <AppButton
                                                type="button"
                                                variant={
                                                  isEnabled ? "primary" : "surface"
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
                                            </FormControl>
                                          </FormItem>
                                        );
                                      }}
                                    />
                                  ) : null}
                                  {showSeed ? (
                                    <FormField
                                      control={form.control}
                                      name="seed"
                                      render={({ field }) => (
                                        <FormItem className="flex flex-col gap-2">
                                          <FormLabel className="text-xs font-bold text-gray-500">
                                            {tLabels("seed")}
                                          </FormLabel>
                                          <FormControl>
                                            <div className="flex items-center gap-2">
                                              <Input
                                                className="h-11 border-white/10 bg-black/30 text-white placeholder:text-gray-600"
                                                placeholder={tImage("seedPlaceholder")}
                                                {...field}
                                              />
                                              <AppButton
                                                type="button"
                                                variant="surface"
                                                size="icon"
                                                onClick={handleRandomizeSeed}
                                                disabled={isGenerating}
                                                aria-label={tLabels("randomize")}
                                              >
                                                <Dice5 className="h-4 w-4" />
                                              </AppButton>
                                            </div>
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  ) : null}
                                </div>
                              </GenerationSettingsPopover>
                            ) : null}
                          </>
                        }
                        footerRight={
                          <>
                            <AppButton
                              type={isAuthenticated ? "submit" : "button"}
                              size="xl"
                              disabled={
                                isGenerating ||
                                (isAuthenticated && (isModelLoading || !hasModels))
                              }
                              className="h-16 min-w-40 rounded-2xl px-6 text-base shadow-none"
                              onClick={
                                isAuthenticated
                                  ? undefined
                                  : () => setIsLoginGateOpen(true)
                              }
                            >
                              {isGenerating
                                ? tActions("generating")
                                : tActions("generate")}
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
                      <FormMessage className="text-xs text-red-400" />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>
        </div>
      </form>
      <LoginGateDialog
        open={isLoginGateOpen}
        onOpenChange={setIsLoginGateOpen}
        title={tLoginGate("title")}
        description={tLoginGate("description")}
        actionLabel={tLoginGate("action")}
        cancelLabel={tLoginGate("cancel")}
      />
    </Form>
  );
}
