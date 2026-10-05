"use client";
import { useState } from "react";
import { ImageGenerationResult } from "./image-generation-result";
import type { Path } from "react-hook-form";
import { useGenerationPromptPreset } from "@/entities/prompt-preset/model/use-generation-prompt-preset";
import { GenerationPromptPresetControls } from "@/entities/prompt-preset/ui/generation-prompt-preset-controls";
import { GenerationPromptPresetChip } from "@/entities/prompt-preset/ui/generation-prompt-preset-chip";
import { promptPresetInputIssue } from "@/shared/prompt-presets/prompt-preset-application";
import { GradioPromptFeedback } from "@/shared/ui/gradio-prompt-feedback";
import { AppSelectRoot, AppSelectTrigger, AppSelectValue, AppSelectContent, AppSelectItem } from "@/shared/ui/app-select";
import { gradioFormError } from "@/shared/model-catalog/gradio-form-validation";
import { getGradioContract } from "@/shared/model-catalog/gradio-contract";
import { GradioContractFields, contractOptionFields } from "@/shared/ui/gradio-contract-fields";
import { useGenerationSearchParams } from "@/shared/lib/generation/query-context";

import { useCallback, useEffect, useMemo, useRef, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dice5,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { GradioFileField } from "@/shared/ui/gradio-file-field";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppForm,
  AppFormControl,
  AppFormControllerField,
  AppFormItem,
  AppFormLabel,
} from "@/shared/ui/app-form";
import { AppPromptFormMessage } from "@/shared/ui/app-prompt-message";
import { AppInput } from "@/shared/ui/app-input";
import { AppPromptEditor } from "@/shared/ui/app-prompt-editor";
import { cn } from "@/shared/lib/utils";
import { GenerationModelSection } from "@/shared/ui/generation-model-section";
import { GenerationPromptField } from "@/shared/ui/generation-prompt-field";
import { isGenerationRepeatCount } from "@/shared/generation/generation-repeat";
import { GenerationImageCountSelector } from "@/shared/ui/generation-image-count-selector";
import { resolveImageOutputCount } from "@/shared/model-catalog/image-output-count";
import { GenerationSettingsPopover } from "@/shared/ui/generation-settings-popover";
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
import { resolveGenerationModalities } from "@/shared/model-catalog/modality";
import {
  applyImageModeChoice,
  resolveImageAuthoringDefaults,
} from "@/shared/generation/image-authoring";

type ImageGenerationFormProps = {
  embedded?: boolean;
  isAuthenticated: boolean;
};

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
        modalities: resolveGenerationModalities(model),
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
  const repeatQuery = searchParams.get("imageCount");
  const repeatFromQuery = isGenerationRepeatCount(Number(repeatQuery)) ? Number(repeatQuery) : 1;
  const [repeatChoice, setRepeatChoice] = useState({ query: repeatQuery, value: repeatFromQuery });
  if (repeatChoice.query !== repeatQuery) setRepeatChoice({ query: repeatQuery, value: repeatFromQuery });
  const repeatCount = repeatChoice.query === repeatQuery ? repeatChoice.value : repeatFromQuery;
  const setRepeatCount = (value: number) => setRepeatChoice({ query: repeatQuery, value });
  const [promptWasEdited, setPromptWasEdited] = useState(false);
  const promptFeedbackSubmitted = form.formState.isSubmitted;
  const mappingPrompt = useWatch({control: form.control, name:"prompt"}) ?? "";
  const mappingInvalid = gradioContract ? gradioFormError(gradioContract, {prompt: mappingPrompt, dynamicParams: contractValues}) !== null : false;
  const presetValues = useWatch({ control: form.control });
  // Subscribe to dirty state before edits, including unregistered provider fields.
  const presetDirtyFields = form.formState.dirtyFields;
  const promptPreset = useGenerationPromptPreset({
    modality: "image", enabled: isAuthenticated, prompt: mappingPrompt, model: activeRuntimeModel,
    getValues: () => form.getValues(),
    isEdited: path => form.getFieldState(path as Path<ImageGenerationFormValues>, { ...form.formState, dirtyFields: presetDirtyFields }).isDirty,
    onApply: (prompt, updates) => {
      form.setValue("prompt", prompt, { shouldDirty: true, shouldValidate: true });
      for (const [path, value] of Object.entries(updates)) {
        form.setValue(path as Path<ImageGenerationFormValues>, value as never, { shouldValidate: true });
      }
    },
  });
  const presetInputIssue = activeRuntimeModel
    ? promptPresetInputIssue(activeRuntimeModel, presetValues as Record<string, unknown>, promptPreset.reference)
    : null;
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
    replaceImages: replaceInitImages,
  } = useImageInitPreviews({
    maxInputImages,
    onChange: handleInitImagesChange,
  });
  const attachmentImages = useMemo(() => initImagePreviews.map(item => item.dataUrl), [initImagePreviews]);

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
      const count = resolveImageOutputCount(model);
      const dynamicParams = { ...current.dynamicParams };
      if (count.fieldName && !Object.hasOwn(dynamicParams, count.fieldName)) dynamicParams[count.fieldName] = count.defaultValue;
      form.reset({ model: activeModel, prompt: current.prompt ?? "", dynamicParams, initImages: current.initImages });
      return;
    }
    const count = resolveImageOutputCount(model);
    if (!count.accepts(form.getValues("imageCount"))) form.setValue("imageCount", count.defaultValue, { shouldValidate: true });
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
    void form.trigger();
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

  const handleSelectModel = (modelId: string) => {
    if (modelId === activeModel) return;
    if (isGenerating) {
      reset();
    }
    form.setValue("dynamicParams", {});
    form.setValue("imageCount", resolveImageOutputCount(runtimeModelMap.get(modelId)).defaultValue);
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

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!isAuthenticated) {
      event.preventDefault();
      handleLoginRedirect();
      return;
    }
    if (isGenerating || isModelLoading || !hasModels) {
      event.preventDefault();
      return;
    }

    if (presetInputIssue) { event.preventDefault(); return; }
    if (mappingInvalid) { setPromptWasEdited(true); form.setValue("prompt", mappingPrompt, {shouldTouch:true}); event.preventDefault(); return; }
    void form.handleSubmit((values) => startGeneration({ ...values, promptPreset: promptPreset.reference }, repeatCount))(event);
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
            <ImageGenerationResult state={state} embedded={embedded} />

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
                            <AppPromptEditor
                              placeholder={tImage("promptPlaceholder")}
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
                            <GradioFileField key={activeModel} label={tImage("uploadReference")} buttonLabel={tImage("uploadReference")}
                              previewLabel={tImage("initImageAlt")}
                              field={{name:"initImages",label:tImage("uploadReference"),kind:"files",media:"image",schema:{},required:false,nullable:false}}
                              maxItems={maxInputImages} value={attachmentImages}
                              disabled={!canUploadImages || isGuest || isGenerating}
                              onChange={value => replaceInitImages(Array.isArray(value) ? value as string[] : [])}/>
                          </div>
                        )}
footerLeft={<>{gradioContract ? <>
<GenerationModelSection modality="image" items={modelOptions} activeId={activeModel} onSelect={handleSelectModel} />
<GenerationSettingsPopover onBlockedOpen={isGuest ? handleLoginRedirect : undefined} disabled={isGenerating || !contractOptionFields(gradioContract).length} label={tLabels("advancedOptions")} summary={tLabels("advancedOptions")} icon={<SlidersHorizontal className="h-4 w-4" />}><GradioContractFields key={activeModel} scope="options" disabled={isGuest || isGenerating} contract={gradioContract} values={contractValues} prompt={mappingPrompt} onChange={values=>{ promptPreset.markProviderEdits(contractValues, values); form.setValue("dynamicParams",values,{shouldDirty:true,shouldValidate:true}); }}/></GenerationSettingsPopover>
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
<GenerationSettingsPopover onBlockedOpen={isGuest ? handleLoginRedirect : undefined} disabled={!(showSizeControls || showModeChoice || showSteps || showGuidanceScale || showPromptUpsampling || showSeed)} label={tLabels("advancedOptions")} summary={tLabels("advancedOptions")} icon={<SlidersHorizontal className="h-4 w-4" />}><div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto p-1">
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
                        )}<GenerationPromptPresetControls controller={promptPreset} disabled={isGuest || isGenerating} inputIssue={presetInputIssue} /><GenerationImageCountSelector value={repeatCount} disabled={isGuest || isGenerating || isModelLoading || !hasModels} onChange={setRepeatCount} /></>}
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
                                  (isModelLoading || !hasModels || mappingInvalid || Boolean(presetInputIssue) || (!gradioContract && !form.formState.isValid) || (!gradioContract && !mappingPrompt.trim())))
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
