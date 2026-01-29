"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Download,
  ExternalLink,
  Grid2x2,
  ImagePlus,
  Maximize2,
  Sparkles,
  Video,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import {
  createVideoGenerationSchema,
  videoGenerationDefaults,
  type VideoGenerationFormValues,
} from "@/features/video-generation/model/video-generation-schema";
import { useVideoGeneration } from "@/features/video-generation/hook/use-video-generation";
import { Button } from "@/shared/ui/button";
import { GenerationCanvas } from "@/shared/ui/generation-canvas";
import { GenerationModelSection } from "@/shared/ui/generation-model-section";
import { GenerationPromptField } from "@/shared/ui/generation-prompt-field";
import { GenerationSettingsPanel } from "@/shared/ui/generation-settings-panel";
import { LoginGateDialog } from "@/features/auth/ui/login-gate-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/shared/ui/form";
import { Textarea } from "@/shared/ui/textarea";
import { cn } from "@/shared/lib/utils";
import { useTranslations } from "next-intl";
import { useRuntimeModelCatalog } from "@/shared/lib/hooks/use-runtime-model-catalog";
import {
  getRuntimeVideoParamConfig,
  getRuntimeVideoParamRange,
  resolveRuntimeDefaultModelKey,
  resolveRuntimeVideoDefaults,
  resolveRuntimeVideoSupportsInitImage,
} from "@/shared/model-catalog/runtime-utils";
import { createRuntimeVideoSchema } from "@/shared/model-catalog/runtime-schema";
import { resolveVideoModalities } from "@/shared/model-catalog/modality";

type VideoGenerationFormProps = {
  isAuthenticated: boolean;
};

export function VideoGenerationForm({ isAuthenticated }: VideoGenerationFormProps) {
  const searchParams = useSearchParams();
  const tGeneration = useTranslations("generation");
  const tVideo = useTranslations("generation.video");
  const tActions = useTranslations("common.actions");
  const tLabels = useTranslations("common.labels");
  const tGenerationActions = useTranslations("generation.actions");
  const tValidation = useTranslations("generation.validation.video");
  const tLoginGate = useTranslations("auth.loginGate");
  const isGuest = !isAuthenticated;
  const { videoModels: runtimeVideoModels, isLoading: isModelLoading } =
    useRuntimeModelCatalog({ enabled: !isGuest });
  const resolvedVideoModels = runtimeVideoModels;
  const hasModels = resolvedVideoModels.length > 0;
  const defaultModelKey = resolveRuntimeDefaultModelKey(resolvedVideoModels) ?? "";
  const runtimeModelMap = useMemo(
    () => new Map(resolvedVideoModels.map((model) => [model.key, model])),
    [resolvedVideoModels],
  );
  const modelCards = useMemo(
    () =>
      resolvedVideoModels.map((model) => ({
        id: model.key,
        name: model.label,
        vendor: model.vendor,
        modalities: resolveVideoModalities(model.meta),
      })),
    [resolvedVideoModels],
  );
  const staticSchema = useMemo(
    () => createVideoGenerationSchema(tValidation),
    [tValidation],
  );
  const runtimeSchema = useMemo(
    () => createRuntimeVideoSchema(resolvedVideoModels, tValidation),
    [resolvedVideoModels, tValidation],
  );
  const resolverRef = useRef<Resolver<VideoGenerationFormValues>>(
    zodResolver(staticSchema) as Resolver<VideoGenerationFormValues>,
  );
  useEffect(() => {
    resolverRef.current = zodResolver(runtimeSchema) as Resolver<VideoGenerationFormValues>;
  }, [runtimeSchema]);
  const resolver = useMemo<Resolver<VideoGenerationFormValues>>(
    () => (values, context, options) =>
      resolverRef.current(values, context, options),
    [],
  );
  const form = useForm<VideoGenerationFormValues>({
    resolver,
    defaultValues: videoGenerationDefaults,
    mode: "onChange",
  });
  const [isLoginGateOpen, setIsLoginGateOpen] = useState(false);

  const promptFromQuery = searchParams?.get("prompt") ?? "";
  useEffect(() => {
    const trimmed = promptFromQuery.trim();
    if (!trimmed) return;
    if (form.getValues("prompt") === trimmed) return;
    form.setValue("prompt", trimmed, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [promptFromQuery, form]);

  const promptValue = useWatch({ control: form.control, name: "prompt" }) ?? "";
  const durationSec =
    useWatch({ control: form.control, name: "durationSec" }) ??
    videoGenerationDefaults.durationSec;
  const watchedModel =
    useWatch({ control: form.control, name: "model" }) ??
    videoGenerationDefaults.model;
  const activeModel = hasModels
    ? runtimeModelMap.has(watchedModel)
      ? watchedModel
      : defaultModelKey
    : "";
  const activeRuntimeModel = runtimeModelMap.get(activeModel);
  const durationRange = getRuntimeVideoParamRange(activeRuntimeModel, "durationSec");
  const durationConfig = getRuntimeVideoParamConfig(
    activeRuntimeModel,
    "durationSec",
  );
  const aspectRatioConfig = getRuntimeVideoParamConfig(
    activeRuntimeModel,
    "aspectRatio",
  );
  const resolutionConfig = getRuntimeVideoParamConfig(
    activeRuntimeModel,
    "resolution",
  );
  const showDuration = durationConfig?.ui !== "hidden";
  const showSizeNotice =
    aspectRatioConfig?.ui === "hidden" && resolutionConfig?.ui === "hidden";
  const initImageValue =
    useWatch({ control: form.control, name: "initImage" }) ?? "";

  const supportsInitImage = resolveRuntimeVideoSupportsInitImage(
    activeRuntimeModel,
  );
  const hasInitImage = Boolean(initImageValue);
  const canSubmit =
    hasModels && promptValue.trim().length > 0 && (!supportsInitImage || hasInitImage);
  const resetModelKey = defaultModelKey || videoGenerationDefaults.model;
  const resetDefaults = useMemo<VideoGenerationFormValues>(() => {
    const model = runtimeModelMap.get(resetModelKey);
    if (!model) return { ...videoGenerationDefaults, model: resetModelKey };
    const defaults = resolveRuntimeVideoDefaults(model);
    return {
      ...videoGenerationDefaults,
      model: resetModelKey,
      aspectRatio: defaults.aspectRatio,
      resolution: defaults.resolution,
      durationSec: defaults.durationSec,
      fps: defaults.fps,
      steps: defaults.steps,
      guidanceScale: defaults.guidanceScale,
    };
  }, [resetModelKey, runtimeModelMap]);

  useEffect(() => {
    if (!hasModels || !defaultModelKey) return;
    const currentModel = form.getValues("model");
    if (runtimeModelMap.has(currentModel)) return;
    form.setValue("model", defaultModelKey, { shouldValidate: true });
  }, [defaultModelKey, form, hasModels, runtimeModelMap]);

  useEffect(() => {
    const model = runtimeModelMap.get(activeModel);
    if (!model) return;
    const defaults = resolveRuntimeVideoDefaults(model);
    form.setValue("aspectRatio", defaults.aspectRatio);
    form.setValue("resolution", defaults.resolution);
    form.setValue("durationSec", defaults.durationSec);
    form.setValue("fps", defaults.fps);
    form.setValue("steps", defaults.steps);
    form.setValue("guidanceScale", defaults.guidanceScale);
    if (!resolveRuntimeVideoSupportsInitImage(model)) {
      form.setValue("initImage", "", { shouldValidate: true });
    }
  }, [activeModel, form, runtimeModelMap]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { state, startGeneration, reset } = useVideoGeneration();
  const isGenerating =
    state.status === "pending" || state.status === "processing";
  const resultVideos = state.result?.videos ?? [];
  const hasResults = state.status === "completed" && resultVideos.length > 0;
  const primaryVideo = resultVideos[0];

  const handleSelectModel = (modelId: string) => {
    if (modelId === activeModel) return;
    if (isGenerating) {
      reset();
    }
    form.setValue("model", modelId, { shouldValidate: true });
  };

  const handleOpenImagePicker = () => {
    fileInputRef.current?.click();
  };

  const handleImageSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        return;
      }
      form.setValue("initImage", result, { shouldValidate: true });
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveInitImage = () => {
    form.setValue("initImage", "", { shouldValidate: true });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleReset = () => {
    form.reset(resetDefaults);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    reset();
  };

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
            items={modelCards}
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
                    disabled
                    aria-disabled="true"
                    variant="surface"
                    size="icon"
                    className="border-white/10 bg-surface-dark/80 text-gray-400 hover:border-white/30 hover:text-white"
                    title={tGenerationActions("gridDisabled")}
                  >
                    <Grid2x2 className="h-5 w-5" />
                  </Button>
                  <Button
                    type="button"
                    disabled
                    aria-disabled="true"
                    variant="surface"
                    size="icon"
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
              {hasResults && primaryVideo ? (
                <video
                  src={primaryVideo.url}
                  controls
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="z-10 flex flex-col items-center px-6 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-surface-dark shadow-[0_0_30px_rgba(212,240,50,0.05)]">
                    <Video className="h-8 w-8 text-gray-600" />
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

            {hasResults && primaryVideo ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
                  {tLabels("ready")} • {primaryVideo.width ?? "--"}x
                  {primaryVideo.height ?? "--"}
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={primaryVideo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-surface-dark/80 text-gray-200 transition-colors hover:border-primary hover:text-white"
                    title={tActions("open")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <a
                    href={primaryVideo.url}
                    download
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-surface-dark/80 text-gray-200 transition-colors hover:border-primary hover:text-white"
                    title={tActions("download")}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </div>
              </div>
            ) : null}

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
                              placeholder={tVideo("promptPlaceholder")}
                              className="min-h-[120px] border-none bg-transparent px-4 py-4 text-white placeholder:text-gray-600 focus-visible:ring-0"
                              {...field}
                            />
                          </FormControl>
                        }
                        attachments={
                          initImageValue ? (
                            <div className="flex flex-wrap gap-2 px-4 pb-3">
                              <div className="group relative h-14 w-14 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={initImageValue}
                                  alt={tVideo("initImageAlt")}
                                  className="h-full w-full object-cover"
                                />
                                <Button
                                  type="button"
                                  onClick={handleRemoveInitImage}
                                  variant="ghost"
                                  size="icon-sm"
                                  className="absolute right-1 top-1 h-5 w-5 rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
                                  title={tActions("remove")}
                                >
                                  <span className="text-xs">×</span>
                                </Button>
                              </div>
                            </div>
                          ) : null
                        }
                        footerLeft={
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={handleOpenImagePicker}
                              aria-label={tVideo("uploadReference")}
                              disabled={!supportsInitImage}
                              className={cn(
                                "transition-colors",
                                supportsInitImage
                                  ? "text-gray-500 hover:bg-white/5 hover:text-white"
                                  : "cursor-not-allowed text-gray-700"
                              )}
                              title={tVideo("uploadReference")}
                            >
                              <ImagePlus className="h-5 w-5" />
                            </Button>
                            <span className="text-[10px] font-mono text-gray-600">
                              {supportsInitImage
                                ? hasInitImage
                                  ? tVideo("mode.imageToVideo")
                                  : tVideo("mode.imageRequired")
                                : tVideo("mode.textOnly")}
                            </span>
                          </>
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
                    (isAuthenticated &&
                      (isModelLoading || !hasModels || !canSubmit))
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

          <GenerationSettingsPanel onReset={handleReset}>
            <div className="flex flex-col gap-8">
              {showSizeNotice && (
                <div className="flex flex-col gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                    {tLabels("outputSize")}
                  </span>
                  <div className="rounded-xl border border-white/10 bg-surface-lighter px-4 py-3 text-xs text-gray-400">
                    {tVideo("sizeNotice")}
                  </div>
                </div>
              )}

              {showDuration && (
                <FormField
                  control={form.control}
                  name="durationSec"
                  render={({ field }) => (
                    <FormItem className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                          {tLabels("durationSec")}
                        </span>
                        <span className="rounded border border-white/10 bg-surface-lighter px-2 py-0.5 text-xs font-bold text-white font-mono">
                          {durationSec}s
                        </span>
                      </div>
                      <FormControl>
                        <input
                          type="range"
                          min={durationRange.min}
                          max={durationRange.max}
                          step={durationRange.step}
                          value={field.value}
                          onChange={(event) =>
                            field.onChange(Number(event.target.value))
                          }
                          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface-lighter"
                        />
                      </FormControl>
                      <div className="flex justify-between px-1 text-[10px] font-mono text-gray-600">
                        <span>{durationRange.min}s</span>
                        <span>{durationRange.max}s</span>
                      </div>
                    </FormItem>
                  )}
                />
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
