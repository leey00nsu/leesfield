"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Clock3,
  Download,
  ExternalLink,
  Image as ImageIcon,
  ImagePlus,
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
import { AppButton } from "@/shared/ui/app-button";
import { Button } from "@/shared/ui/button";
import { GenerationCanvas } from "@/shared/ui/generation-canvas";
import { GenerationModelSection } from "@/shared/ui/generation-model-section";
import { GenerationPromptField } from "@/shared/ui/generation-prompt-field";
import { GenerationSettingsPopover } from "@/shared/ui/generation-settings-popover";
import { GenerationStudioIntro } from "@/shared/ui/generation-studio-intro";
import { LoginGateDialog } from "@/features/auth/ui/login-gate-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
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

const dockChipClass =
  "inline-flex h-12 items-center gap-2 rounded-xl border border-white/12 bg-black/16 px-3 text-sm font-medium text-white/82";
const studioPreviewShellClass =
  "flex flex-col items-center px-4 pb-56 sm:px-6 lg:pb-64";
const studioResultFrameClass =
  "mt-10 min-h-[18rem] w-full max-w-6xl rounded-[1.75rem] border border-white/10 bg-[#0b0d0c]/72 shadow-[0_24px_90px_rgba(0,0,0,0.46)] sm:min-h-[24rem]";

export function VideoGenerationForm({ isAuthenticated }: VideoGenerationFormProps) {
  const searchParams = useSearchParams();
  const tGeneration = useTranslations("generation");
  const tVideo = useTranslations("generation.video");
  const tActions = useTranslations("common.actions");
  const tLabels = useTranslations("common.labels");
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
  const modelFromQuery = searchParams?.get("model") ?? "";
  const initImageFromQuery = searchParams?.get("initImage") ?? "";
  const hasInjectedInitImageRef = useRef(false);
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

  useEffect(() => {
    if (hasInjectedInitImageRef.current) return;
    const trimmed = initImageFromQuery.trim();
    if (!trimmed) return;

    const trimmedModel = modelFromQuery.trim();
    if (
      trimmedModel &&
      hasModels &&
      runtimeModelMap.has(trimmedModel) &&
      activeModel !== trimmedModel
    ) {
      return;
    }

    if (!supportsInitImage) return;
    if (form.getValues("initImage") === trimmed) return;

    form.setValue("initImage", trimmed, {
      shouldDirty: true,
      shouldValidate: true,
    });
    hasInjectedInitImageRef.current = true;
  }, [
    activeModel,
    form,
    hasModels,
    initImageFromQuery,
    modelFromQuery,
    runtimeModelMap,
    supportsInitImage,
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
        <div className="flex flex-col gap-6">
          <div className={studioPreviewShellClass}>
            <GenerationStudioIntro
              eyebrow={tVideo("previewEyebrow")}
              title={tVideo("previewTitle")}
              description={tVideo("previewDescription")}
            />
            <GenerationCanvas
              isGenerating={isGenerating}
              status={state.status}
              errorMessage={state.errorMessage}
              className={studioResultFrameClass}
            >
              {hasResults && primaryVideo ? (
                <video
                  src={primaryVideo.url}
                  controls
                  className="relative z-10 h-full w-full object-cover"
                />
              ) : (
                <div aria-hidden="true" className="h-full w-full" />
              )}
            </GenerationCanvas>
          </div>

          {hasResults && state.errorMessage ? (
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              {state.errorMessage}
            </div>
          ) : null}

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
                        className="min-h-[104px] border-none bg-transparent px-5 py-5 text-base text-white placeholder:text-gray-500 focus-visible:ring-0"
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
                      <AppButton
                        type="button"
                        variant="surface"
                        size="icon"
                        onClick={handleOpenImagePicker}
                        aria-label={tVideo("uploadReference")}
                        disabled={!supportsInitImage}
                        className={cn(
                          "h-12 w-12 rounded-xl border-primary/20 bg-black/16 transition-colors",
                          supportsInitImage
                            ? "text-white hover:border-primary/50 hover:bg-black/24 hover:text-primary"
                            : "cursor-not-allowed text-gray-700",
                        )}
                        title={tVideo("uploadReference")}
                      >
                        <ImagePlus className="h-5 w-5" />
                      </AppButton>
                      {!isGuest && hasModels ? (
                        <GenerationModelSection
                          modality="video"
                          items={modelCards}
                          activeId={activeModel}
                          onSelect={handleSelectModel}
                        />
                      ) : (
                        <button
                          type="button"
                          disabled
                          className={cn(
                            dockChipClass,
                            "max-w-[13rem] cursor-not-allowed opacity-70",
                          )}
                        >
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-black text-primary">
                            M
                          </span>
                          <span className="truncate">
                            {isModelLoading
                              ? tGeneration("modelLoading")
                              : isGuest
                                ? tGeneration("modelLoginRequired")
                                : tGeneration("modelUnavailable")}
                          </span>
                        </button>
                      )}
                      <span className={dockChipClass}>
                        <Video className="h-4 w-4" />
                        {supportsInitImage
                          ? hasInitImage
                            ? tVideo("mode.imageToVideo")
                            : tVideo("mode.imageRequired")
                          : tVideo("mode.textOnly")}
                      </span>
                      {showDuration ? (
                        <GenerationSettingsPopover
                          label={tLabels("durationSec")}
                          summary={`${durationSec}s`}
                          icon={<Clock3 className="h-4 w-4" />}
                        >
                          <FormField
                            control={form.control}
                            name="durationSec"
                            render={({ field: durationField }) => (
                              <FormItem className="flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                  <FormLabel className="text-xs font-bold text-gray-500">
                                    {tLabels("durationSec")}
                                  </FormLabel>
                                  <span className="text-sm font-bold text-white">
                                    {durationSec}s
                                  </span>
                                </div>
                                <FormControl>
                                  <input
                                    type="range"
                                    min={durationRange.min}
                                    max={durationRange.max}
                                    step={durationRange.step}
                                    value={durationField.value}
                                    onChange={(event) =>
                                      durationField.onChange(
                                        Number(event.target.value),
                                      )
                                    }
                                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/15"
                                  />
                                </FormControl>
                                <div className="flex justify-between px-1 text-[10px] font-mono text-gray-600">
                                  <span>{durationRange.min}s</span>
                                  <span>{durationRange.max}s</span>
                                </div>
                              </FormItem>
                            )}
                          />
                        </GenerationSettingsPopover>
                      ) : null}
                      {showSizeNotice ? (
                        <GenerationSettingsPopover
                          label={tLabels("outputSize")}
                          summary="Auto"
                          icon={<ImageIcon className="h-4 w-4" />}
                        >
                          <p className="text-sm leading-relaxed text-gray-300">
                            {tVideo("sizeNotice")}
                          </p>
                        </GenerationSettingsPopover>
                      ) : null}
                    </>
                  }
                  footerRight={
                    <>
                      <span className="hidden text-[10px] font-mono text-gray-600 sm:inline">
                        {tLabels("chars", { count: promptValue.length })}
                      </span>
                      <AppButton
                        type={isAuthenticated ? "submit" : "button"}
                        size="xl"
                        disabled={
                          isGenerating ||
                          (isAuthenticated &&
                            (isModelLoading || !hasModels || !canSubmit))
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
                  className="hidden"
                  onChange={handleImageSelection}
                />
                <FormMessage className="text-xs text-red-400" />
              </FormItem>
            )}
          />
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
