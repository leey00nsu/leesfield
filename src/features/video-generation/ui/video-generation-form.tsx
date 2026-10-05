"use client";
import { useState } from "react";
import type { Path } from "react-hook-form";
import { useGenerationPromptPreset } from "@/entities/prompt-preset/model/use-generation-prompt-preset";
import { GenerationPromptPresetControls } from "@/entities/prompt-preset/ui/generation-prompt-preset-controls";
import { GenerationPromptPresetChip } from "@/entities/prompt-preset/ui/generation-prompt-preset-chip";
import { promptPresetInputIssue } from "@/shared/prompt-presets/prompt-preset-application";
import { GradioPromptFeedback } from "@/shared/ui/gradio-prompt-feedback";
import { SlidersHorizontal } from "lucide-react";
import { gradioFormError } from "@/shared/model-catalog/gradio-form-validation";
import { getGradioContract } from "@/shared/model-catalog/gradio-contract";
import { GradioContractFields, contractOptionFields } from "@/shared/ui/gradio-contract-fields";
import { useGenerationSearchParams } from "@/shared/lib/generation/query-context";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Download,
  Sparkles,
  Video,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import { GradioFileField } from "@/shared/ui/gradio-file-field";
import { AppButton } from "@/shared/ui/app-button";
import { AppMediaOpenButton } from "@/shared/ui/app-media-open-button";
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
} from "@/shared/ui/app-form";
import { AppPromptFormMessage } from "@/shared/ui/app-prompt-message";
import { AppPromptEditor } from "@/shared/ui/app-prompt-editor";
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
import { resolveGenerationModalities } from "@/shared/model-catalog/modality";

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
        modalities: resolveGenerationModalities(model),
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
    zodResolver(staticSchema) as unknown as Resolver<VideoGenerationFormValues>,
  );
  useEffect(() => {
    resolverRef.current = zodResolver(
      runtimeSchema,
    ) as unknown as Resolver<VideoGenerationFormValues>;
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
  const presetValues = useWatch({ control: form.control });
  // Subscribe to dirty state before edits, including unregistered provider fields.
  const presetDirtyFields = form.formState.dirtyFields;
  const promptPreset = useGenerationPromptPreset({
    modality: "video", enabled: isAuthenticated, prompt: mappingPrompt, model: activeRuntimeModel,
    getValues: () => form.getValues(),
    isEdited: path => form.getFieldState(path as Path<VideoGenerationFormValues>, { ...form.formState, dirtyFields: presetDirtyFields }).isDirty,
    onApply: (prompt, updates) => {
      form.setValue("prompt", prompt, { shouldDirty: true, shouldValidate: true });
      for (const [path, value] of Object.entries(updates)) {
        form.setValue(path as Path<VideoGenerationFormValues>, value as never, { shouldValidate: true });
      }
    },
  });
  const presetInputIssue = activeRuntimeModel
    ? promptPresetInputIssue(activeRuntimeModel, presetValues as Record<string, unknown>, promptPreset.reference)
    : null;
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
    if (getGradioContract(model)) {
      const current = form.getValues();
      form.reset({ model: activeModel, prompt: current.prompt ?? "", dynamicParams: current.dynamicParams ?? {}, initImage: current.initImage });
      return;
    }
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

  const { state, startGeneration, reset } = useVideoGeneration(activeRuntimeModel?.provider==="modal_comfyui" ? Number(activeRuntimeModel.providerConfig?.timeout_ms??900_000) : undefined);
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

    if (presetInputIssue) { event.preventDefault(); return; }
    if (mappingInvalid) { setPromptWasEdited(true); form.setValue("prompt", mappingPrompt, {shouldTouch:true}); event.preventDefault(); return; }
    void form.handleSubmit((values) => startGeneration({ ...values, promptPreset: promptPreset.reference }))(event);
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
                <AppMediaOpenButton href={primaryVideo.url} />
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
                      <AppPromptEditor
                        placeholder={tVideo("promptPlaceholder")}
                        {...field}
                        value={promptPreset.text}
                        disabled={isGuest || isGenerating}
                        token={promptPreset.preset ? { id: promptPreset.preset.key, offset: promptPreset.tokenOffset, label: promptPreset.preset.name, content: <GenerationPromptPresetChip controller={promptPreset} disabled={isGuest || isGenerating} /> } : undefined}
                        onChange={(text, present, offset) => { setPromptWasEdited(true); promptPreset.editText(text, present, offset); }}
                      />
                    </AppFormControl>
                  }
                  feedback={
                    gradioContract && !mappingPrompt.trim() && ((fieldState.isTouched && promptWasEdited) || promptFeedbackSubmitted) ? <GradioPromptFeedback contract={gradioContract}/> : fieldState.error && ((fieldState.isTouched && promptWasEdited) || promptFeedbackSubmitted) ? (
                      <AppPromptFormMessage />
                    ) : undefined
                  }
                  attachments={gradioContract ? (<GradioContractFields key={activeModel} scope="attachments" disabled={isGuest || isGenerating}
                    contract={gradioContract} values={contractValues} prompt={mappingPrompt}
                    onChange={values => { promptPreset.markProviderEdits(contractValues, values); form.setValue("dynamicParams", values, { shouldDirty: true, shouldValidate: true }); }} />) : (
                    <div className="px-4 pt-4">
                      <GradioFileField key={activeModel} label={tVideo("uploadReference")} buttonLabel={tVideo("uploadReference")}
                        previewLabel={tVideo("initImageAlt")}
                        field={{name:"initImage",label:tVideo("uploadReference"),kind:"file",media:"image",schema:{},required:false,nullable:false}}
                        value={initImageValue || undefined} disabled={!supportsInitImage || isGuest || isGenerating}
                        onChange={value => form.setValue("initImage", typeof value === "string" ? value : "", {shouldValidate:true})}/>
                    </div>
                  )}
footerLeft={<>{gradioContract ? <>
<GenerationModelSection modality="video" items={modelCards} activeId={activeModel} onSelect={handleSelectModel} />
<GenerationSettingsPopover onBlockedOpen={isGuest ? handleLoginRedirect : undefined} disabled={isGenerating || !contractOptionFields(gradioContract).length} label={tLabels("advancedOptions")} summary={tLabels("advancedOptions")} icon={<SlidersHorizontal className="h-4 w-4" />}><GradioContractFields key={activeModel} scope="options" disabled={isGuest || isGenerating} contract={gradioContract} values={contractValues} prompt={mappingPrompt} onChange={values=>{ promptPreset.markProviderEdits(contractValues, values); form.setValue("dynamicParams",values,{shouldDirty:true,shouldValidate:true}); }}/></GenerationSettingsPopover>
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
                  )}<GenerationPromptPresetControls controller={promptPreset} disabled={isGuest || isGenerating} inputIssue={presetInputIssue} /></>}
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
                            (isModelLoading || !hasModels || mappingInvalid || Boolean(presetInputIssue) || (!gradioContract && !form.formState.isValid) || (!gradioContract && !canSubmit)))
                        }
                        className="min-w-24"
                        onClick={
                          isAuthenticated ? undefined : handleLoginRedirect
                        }
                      >
                        {tActions("generate")}
                        <Sparkles className="h-5 w-5" />
                      </AppButton>
                    </>
                  }
                />
              </AppFormItem>
            )}
          />
        </div>
      </form>
    </AppForm>
  );
}
