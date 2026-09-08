"use client";
import { useState } from "react";
import { GradioPromptFeedback } from "@/shared/ui/gradio-prompt-feedback";
import { SlidersHorizontal } from "lucide-react";
import { gradioFormError } from "@/shared/model-catalog/gradio-form-validation";
import { getGradioContract } from "@/shared/model-catalog/gradio-contract";
import { GradioContractFields } from "@/shared/ui/gradio-contract-fields";
import { useGenerationSearchParams } from "@/shared/lib/generation/query-context";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Download,
  ExternalLink,
  ImagePlus,
  Sparkles,
  Video,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import {
  createVideoGenerationSchema,
  videoGenerationDefaults,
  type VideoGenerationFormValues,
} from "@/features/video-generation/model/video-generation-schema";
import { useVideoGeneration } from "@/features/video-generation/hook/use-video-generation";
import { AppButton } from "@/shared/ui/app-button";
import { GenerationCanvas } from "@/shared/ui/generation-canvas";
import { GenerationModelSection } from "@/shared/ui/generation-model-section";
import { GenerationPromptField } from "@/shared/ui/generation-prompt-field";
import { GenerationSettingsPopover } from "@/shared/ui/generation-settings-popover";
import { GenerationResultReveal } from "@/shared/ui/generation-result-reveal";
import { GenerationStudioIntro } from "@/shared/ui/generation-studio-intro";
import { buildLoginHref } from "@/features/auth/lib/login-redirect";
import {
  AppForm,
  AppFormControl,
  AppFormControllerField,
  AppFormItem,
  AppFormLabel,
  AppFormMessage,
} from "@/shared/ui/app-form";
import { AppTextarea } from "@/shared/ui/app-form-control";
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
  embedded?: boolean;
  isAuthenticated: boolean;
};

const dockChipClass =
  "inline-flex h-12 items-center gap-2 rounded-xl border border-white/12 bg-black/16 px-3 text-sm font-medium text-white/82";
const studioPreviewShellClass =
  "flex flex-col items-center px-4 pb-56 sm:px-6 lg:pb-64";
const studioResultFrameClass =
  "mt-10 min-h-[18rem] w-full max-w-6xl rounded-[1.75rem] border border-white/10 bg-[#0b0d0c]/72 shadow-[0_24px_90px_rgba(0,0,0,0.46)] sm:min-h-[24rem]";

export function VideoGenerationForm({
  isAuthenticated,
  embedded = false,
}: VideoGenerationFormProps) {
  const searchParams = useGenerationSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const tGeneration = useTranslations("generation");
  const tVideo = useTranslations("generation.video");
  const tActions = useTranslations("common.actions");
  const tLabels = useTranslations("common.labels");
  const tValidation = useTranslations("generation.validation.video");
  const isGuest = !isAuthenticated;
  const { videoModels: runtimeVideoModels, isLoading: isModelLoading } =
    useRuntimeModelCatalog({ enabled: !isGuest });
  const resolvedVideoModels = runtimeVideoModels;
  const hasModels = resolvedVideoModels.length > 0;
  const defaultModelKey =
    resolveRuntimeDefaultModelKey(resolvedVideoModels) ?? "";
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
    resolverRef.current = zodResolver(
      runtimeSchema,
    ) as Resolver<VideoGenerationFormValues>;
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
  const promptFromQuery = searchParams?.get("prompt") ?? "";
  const modelFromQuery =
    searchParams?.get("model") ??
    resolvedVideoModels.find(
      (model) => model.label === searchParams?.get("modelLabel"),
    )?.key ??
    "";
  const initImageFromQuery = searchParams?.get("initImage") ?? "";
  const hasInjectedInitImageRef = useRef(false);
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
  const gradioContract = activeRuntimeModel ? getGradioContract(activeRuntimeModel) : null;
  const contractValues = useWatch({control: form.control, name:"dynamicParams"}) ?? {};
  const [promptWasEdited, setPromptWasEdited] = useState(false);
  const promptFeedbackSubmitted = form.formState.isSubmitted;
  const mappingPrompt = useWatch({control: form.control, name:"prompt"}) ?? "";
  const mappingInvalid = gradioContract ? gradioFormError(gradioContract, {prompt: mappingPrompt, dynamicParams: contractValues}) !== null : false;
  const durationRange = getRuntimeVideoParamRange(
    activeRuntimeModel,
    "durationSec",
  );
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

  const supportsInitImage =
    resolveRuntimeVideoSupportsInitImage(activeRuntimeModel);
  const hasInitImage = Boolean(initImageValue);
  const canSubmit =
    hasModels &&
    promptValue.trim().length > 0 &&
    (!supportsInitImage || hasInitImage);

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
    state.status === "pending" ||
    state.status === "processing" ||
    state.status === "uploading";
  const resultVideos = state.result?.videos ?? [];
  const hasResults = state.status === "completed" && resultVideos.length > 0;
  const primaryVideo = resultVideos[0];

  const handleSelectModel = (modelId: string) => {
    if (modelId === activeModel) return;
    if (isGenerating) {
      reset();
    }
    form.setValue("dynamicParams", {});
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
        <div className="flex flex-col gap-6">
          <GenerationResultReveal visible={!embedded || isGenerating || hasResults || state.status === "failed"} className={embedded ? "generation-result" : studioPreviewShellClass}>
            {!embedded && (<GenerationStudioIntro
                compact={embedded}
                guidance={tGeneration("page.videoGuidance")}
              eyebrow={tVideo("previewEyebrow")}
              title={tVideo("previewTitle")}
              description={tVideo("previewDescription")}
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
              {hasResults && primaryVideo ? (
                <video
                  src={primaryVideo.url}
                  controls
                  className="relative z-10 h-full w-full object-contain"
                />
              ) : (
                <div aria-hidden="true" className="h-full w-full" />
              )}
            </GenerationCanvas>
            </GenerationResultReveal>

          {hasResults && state.errorMessage ? (
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              {state.errorMessage}
            </div>
          ) : null}

          {hasResults && primaryVideo ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-sans uppercase tracking-widest text-gray-500">
                {tLabels("ready")} • {primaryVideo.width ?? "--"}x
                {primaryVideo.height ?? "--"}
              </div>
              <div className="flex items-center gap-2">
                <AppButton asChild variant="surface" size="icon-sm">
                  <a
                    href={primaryVideo.url}
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
                    href={primaryVideo.url}
                    download
                    title={tActions("download")}
                    aria-label={tActions("download")}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </AppButton>
              </div>
            </div>
          ) : null}

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
                        placeholder={tVideo("promptPlaceholder")}
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
                      {initImageValue ? (
                        <div className="flex flex-wrap gap-2">
                          <div className="group relative h-14 w-14 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={initImageValue}
                              alt={tVideo("initImageAlt")}
                              className="h-full w-full object-cover"
                            />
                            <AppButton
                              type="button"
                              onClick={handleRemoveInitImage}
                              variant="ghost"
                              size="icon-sm"
                              className="absolute right-1 top-1 h-5 w-5 rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
                              title={tActions("remove")}
                            >
                              <span className="text-xs">×</span>
                            </AppButton>
                          </div>
                        </div>
                      ) : null}
                      <AppButton
                        type="button"
                        variant="surface"
                        size="icon"
                        onClick={handleOpenImagePicker}
                        aria-label={tVideo("uploadReference")}
                        disabled={!supportsInitImage}
                        className={cn(
                          "",
                          supportsInitImage
                            ? "text-white hover:border-primary/20 hover:bg-black/16 hover:text-white"
                            : "cursor-not-allowed text-gray-700",
                        )}
                        title={tVideo("uploadReference")}
                      >
                        <ImagePlus className="h-5 w-5" />
                      </AppButton>
                    </div>
                  )}
footerLeft={gradioContract ? <>
<GenerationModelSection modality="video" items={modelCards} activeId={activeModel} onSelect={handleSelectModel} />
<GenerationSettingsPopover onBlockedOpen={isGuest ? handleLoginRedirect : undefined} disabled={!gradioContract.inputs.some(f => !f.canonical && !f.hidden)} label={tLabels("advancedOptions")} summary={tLabels("advancedOptions")} icon={<SlidersHorizontal className="h-4 w-4" />}><GradioContractFields key={activeModel} contract={gradioContract} values={contractValues} prompt={mappingPrompt} onChange={values=>form.setValue("dynamicParams",values,{shouldValidate:true})}/></GenerationSettingsPopover>
</> : (
                    <>
                      {!isGuest && hasModels ? (
                        <GenerationModelSection
                          modality="video"
                          items={modelCards}
                          activeId={activeModel}
                          onSelect={handleSelectModel}
                        />
                      ) : (
                        <GenerationModelSection modality="video" items={[]} activeId={null} onSelect={() => {}} disabled loading={isModelLoading} selectionLabel={isGuest ? tGeneration("modelLoginRequired") : tGeneration("modelUnavailable")} />
                      )}
<GenerationSettingsPopover onBlockedOpen={isGuest ? handleLoginRedirect : undefined} label={tLabels("advancedOptions")} summary={tLabels("advancedOptions")} icon={<SlidersHorizontal className="h-4 w-4" />}><div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto p-1">
                      <span className={dockChipClass}>
                        <Video className="h-4 w-4" />
                        {supportsInitImage
                          ? hasInitImage
                            ? tVideo("mode.imageToVideo")
                            : tVideo("mode.imageRequired")
                          : tVideo("mode.textOnly")}
                      </span>
                      {showDuration ? (
                        <div>
                          <AppFormControllerField
                            control={form.control}
                            name="durationSec"
                            render={({ field: durationField }) => (
                              <AppFormItem className="flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                  <AppFormLabel className="text-xs font-bold text-gray-500">
                                    {tLabels("durationSec")}
                                  </AppFormLabel>
                                  <span className="text-sm font-bold text-white">
                                    {durationSec}s
                                  </span>
                                </div>
                                <AppFormControl>
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
                                </AppFormControl>
                                <div className="flex justify-between px-1 text-[10px] font-sans text-gray-600">
                                  <span>{durationRange.min}s</span>
                                  <span>{durationRange.max}s</span>
                                </div>
                              </AppFormItem>
                            )}
                          />
                        </div>
                      ) : null}
                      {showSizeNotice ? (
                        <div>
                          <p className="text-sm leading-relaxed text-gray-300">
                            {tVideo("sizeNotice")}
                          </p>
                        </div>
                      ) : null}
</div></GenerationSettingsPopover>
                    </>
                  )}
footerRight={
                    <>
                      <AppButton
                        variant="generate"
                              type={isAuthenticated ? "submit" : "button"}
                        size="xl"
                        disabled={
                          isGenerating ||
                          (isAuthenticated &&
                            (isModelLoading || !hasModels || mappingInvalid || (!gradioContract && !form.formState.isValid) || (!gradioContract && !canSubmit)))
                        }
                        className="min-w-24"
                        onClick={
                          isAuthenticated ? undefined : handleLoginRedirect
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
              </AppFormItem>
            )}
          />
        </div>
      </form>
    </AppForm>
  );
}
