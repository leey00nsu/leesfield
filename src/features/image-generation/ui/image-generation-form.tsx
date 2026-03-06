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
  Grid2x2,
  Image as ImageIcon,
  ImagePlus,
  Maximize2,
  Sparkles,
  X,
} from "lucide-react";
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
import { GenerationSettingsPanel } from "@/shared/ui/generation-settings-panel";
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

export function ImageGenerationForm({ isAuthenticated }: ImageGenerationFormProps) {
  const searchParams = useSearchParams();
  const tGeneration = useTranslations("generation");
  const tImage = useTranslations("generation.image");
  const tActions = useTranslations("common.actions");
  const tLabels = useTranslations("common.labels");
  const tGenerationActions = useTranslations("generation.actions");
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
    ? modeConfig.options.filter(
        (option): option is string =>
          typeof option === "string" && option.trim().length > 0,
      )
    : [];
  const showSizeControls =
    widthConfig?.ui !== "hidden" || heightConfig?.ui !== "hidden";
  const showSteps = stepsConfig?.ui !== "hidden";
  const showModeChoice = modeConfig?.ui !== "hidden" && modeOptions.length > 0;
  const showGuidanceScale = guidanceConfig?.ui !== "hidden";
  const showPromptUpsampling = promptUpsamplingConfig?.ui !== "hidden";
  const showSeed = seedConfig?.ui !== "hidden";
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
    reset: resetInitImagePreviews,
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

  const resultsGridClass =
    resultImages.length <= 1
      ? "grid-cols-1"
      : resultImages.length === 2
      ? "grid-cols-2"
      : "grid-cols-2 lg:grid-cols-3";

  const resetDefaults: ImageGenerationFormValues = (() => {
    const model = runtimeModelMap.get(defaultModelKey);
    if (!model) return imageGenerationDefaults;
    const defaults = resolveRuntimeImageDefaults(model);
    return {
      ...imageGenerationDefaults,
      model: defaultModelKey,
      width: defaults.width,
      height: defaults.height,
      steps: defaults.steps,
      guidanceScale: defaults.guidanceScale,
      modeChoice: defaults.modeChoice,
      promptUpsampling: defaults.promptUpsampling,
    };
  })();

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
        className="flex flex-col gap-8"
        onSubmit={handleFormSubmit}
      >
        {!isGuest && (
          <GenerationModelSection
            items={modelOptions}
            activeId={activeModel}
            onSelect={handleSelectModel}
            action={
              <Button
                type="button"
                variant="link"
                disabled
                aria-disabled="true"
                className="h-auto p-0 text-xs font-bold uppercase text-primary hover:underline"
                title={tActions("comingSoon")}
              >
                {tActions("viewAllModels")}
              </Button>
            }
          />
        )}
        {isGuest && (
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300">
            {tGeneration("modelLoginRequired")}
          </div>
        )}
        {!isGuest && isModelLoading && (
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300">
            {tGeneration("modelLoading")}
          </div>
        )}
        {!isGuest && !isModelLoading && !hasModels && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            {tGeneration("noModels")}
          </div>
        )}

        <div className="flex flex-col gap-8 xl:flex-row">
          <div className="flex flex-1 flex-col gap-6">
            <GenerationCanvas
              actions={
                <>
                <Button
                  type="button"
                  variant="surface"
                  size="icon"
                  disabled
                  aria-disabled="true"
                  className="border-white/10 bg-surface-dark/80 text-gray-400 hover:border-white/30 hover:text-white"
                  title={tGenerationActions("gridDisabled")}
                >
                  <Grid2x2 className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  variant="surface"
                  size="icon"
                  disabled
                  aria-disabled="true"
                  className="border-white/10 bg-surface-dark/80 text-gray-400 hover:border-white/30 hover:text-white"
                  title={tGenerationActions("fullScreenDisabled")}
                >
                  <Maximize2 className="h-5 w-5" />
                </Button>
                </>
              }
              isGenerating={isGenerating}
              status={state.status}
              errorMessage={state.errorMessage}
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
                <div className="z-10 flex flex-col items-center px-6 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-surface-dark shadow-[0_0_30px_rgba(212,240,50,0.05)]">
                    <ImageIcon className="h-8 w-8 text-gray-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-300">
                    {tGeneration("canvas.emptyTitle")}
                  </h3>
                  <p className="mt-1 text-sm font-mono text-gray-600">
                    {tGeneration("canvas.emptyDescription")}
                  </p>
                </div>
              )}
            </GenerationCanvas>

            {hasResults && state.errorMessage && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                {state.errorMessage}
              </div>
            )}

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 lg:flex-row">
                <FormField
                  control={form.control}
                  name="prompt"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <GenerationPromptField
                        textarea={
                          <FormControl>
                            <Textarea
                              placeholder={tImage("promptPlaceholder")}
                              className="min-h-[120px] border-none bg-transparent px-4 py-4 text-white placeholder:text-gray-600 focus-visible:ring-0"
                              {...field}
                            />
                          </FormControl>
                        }
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
                                    onClick={() =>
                                      handleRemoveInitImage(item.id)
                                    }
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
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={handleOpenImagePicker}
                            disabled={
                              !canUploadImages ||
                              initImagePreviews.length >= maxInputImages
                            }
                            className="text-gray-500 hover:bg-white/5 hover:text-white"
                            title={
                              canUploadImages
                                ? tImage("uploadReference")
                                : tImage("uploadUnsupported")
                            }
                          >
                            <ImagePlus className="h-5 w-5" />
                          </Button>
                        }
                        footerRight={
                          <span className="text-[10px] font-mono text-gray-600">
                            {tLabels("chars", { count: promptValue.length })}
                          </span>
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

                <Button
                  type={isAuthenticated ? "submit" : "button"}
                  variant="hero"
                  size="hero"
                  disabled={
                    isGenerating ||
                    (isAuthenticated && (isModelLoading || !hasModels))
                  }
                  className="flex-col"
                  onClick={
                    isAuthenticated
                      ? undefined
                      : () => setIsLoginGateOpen(true)
                  }
                >
                  <Sparkles className="h-7 w-7" />
                  {isGenerating ? tActions("generating") : tActions("generate")}
                </Button>
              </div>
            </div>
          </div>

          <GenerationSettingsPanel
            onReset={() => {
              form.reset(resetDefaults);
              resetInitImagePreviews();
              reset();
            }}
          >
            <div className="flex flex-col gap-8">
              {showSizeControls && (
                <div className="flex flex-col gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                    {tLabels("outputSize")}
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    {widthConfig?.ui !== "hidden" && (
                      <FormField
                        control={form.control}
                        name="width"
                        render={({ field }) => (
                          <FormItem className="flex flex-col gap-2">
                            <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
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
                                className="h-10 border-white/10 bg-surface-lighter font-mono text-sm text-white"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    )}
                    {heightConfig?.ui !== "hidden" && (
                      <FormField
                        control={form.control}
                        name="height"
                        render={({ field }) => (
                          <FormItem className="flex flex-col gap-2">
                            <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
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
                                className="h-10 border-white/10 bg-surface-lighter font-mono text-sm text-white"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between px-1 text-xs text-gray-500">
                    <span>
                      {tLabels("range", {
                        min: widthRange.min,
                        max: widthRange.max,
                      })}
                    </span>
                    <span className="text-white">
                      {width} × {height}
                    </span>
                  </div>
                </div>
              )}

              <div className="h-px bg-white/5" />

              <div className="flex flex-col gap-6">
                {showModeChoice && (
                  <FormField
                    control={form.control}
                    name="modeChoice"
                    render={({ field }) => (
                      <FormItem className="flex flex-col gap-3">
                        <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                          {tLabels("modeChoice")}
                        </FormLabel>
                        <FormControl>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {modeOptions.map((option) => {
                              const isActive = field.value === option;
                              return (
                                <Button
                                  key={option}
                                  type="button"
                                  variant={isActive ? "default" : "surface"}
                                  size="sm"
                                  aria-pressed={isActive}
                                  onClick={() => field.onChange(option)}
                                  className={cn(
                                    "h-auto justify-start whitespace-normal text-xs font-semibold",
                                    isActive ? "text-black" : "text-gray-300",
                                  )}
                                >
                                  {option}
                                </Button>
                              );
                            })}
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}

                {showSteps && (
                  <FormField
                    control={form.control}
                    name="steps"
                    render={({ field }) => (
                      <FormItem className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                            {tLabels("steps")}
                          </FormLabel>
                          <span className="rounded border border-white/10 bg-surface-lighter px-2 py-0.5 text-xs font-bold text-white font-mono">
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
                              field.onChange(Number(event.target.value))
                            }
                            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface-lighter disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}

                {showGuidanceScale && (
                  <FormField
                    control={form.control}
                    name="guidanceScale"
                    render={({ field }) => (
                      <FormItem className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                            {tLabels("guidanceScale")}
                          </FormLabel>
                          <span className="rounded border border-white/10 bg-surface-lighter px-2 py-0.5 text-xs font-bold text-white font-mono">
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
                              field.onChange(Number(event.target.value))
                            }
                            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface-lighter disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}

                {showPromptUpsampling && (
                  <FormField
                    control={form.control}
                    name="promptUpsampling"
                    render={({ field }) => {
                      const isEnabled = Boolean(field.value);
                      return (
                        <FormItem className="flex items-center justify-between gap-4">
                          <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                            {tLabels("promptUpsampling")}
                          </FormLabel>
                          <FormControl>
                            <Button
                              type="button"
                              variant={isEnabled ? "default" : "surface"}
                              size="sm"
                              aria-pressed={isEnabled}
                              onClick={() => field.onChange(!isEnabled)}
                              className={cn(
                                "h-8 px-3 text-xs font-bold uppercase tracking-wider",
                                isEnabled ? "text-black" : "text-gray-300",
                              )}
                            >
                              {isEnabled
                                ? tLabels("enabled")
                                : tLabels("disabled")}
                            </Button>
                          </FormControl>
                        </FormItem>
                      );
                    }}
                  />
                )}
              </div>

              <div className="h-px bg-white/5" />

              {showSeed && (
                <div className="flex flex-col gap-4">
                  <FormField
                    control={form.control}
                    name="seed"
                    render={({ field }) => (
                      <FormItem className="flex flex-col gap-2">
                        <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                          {tLabels("seed")}
                        </FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input
                              className="h-10 flex-1 border-white/10 bg-surface-lighter font-mono text-sm text-white placeholder:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                              placeholder={tImage("seedPlaceholder")}
                              {...field}
                            />
                            <Button
                              type="button"
                              variant="surface"
                              size="icon-sm"
                              onClick={handleRandomizeSeed}
                              disabled={isGenerating}
                              className="border-white/10 bg-surface-lighter text-gray-200 hover:border-primary hover:text-primary disabled:hover:border-white/10 disabled:hover:text-gray-500"
                            >
                              <Dice5 className="h-4 w-4" />
                            </Button>
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>
          </GenerationSettingsPanel>
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
