"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Download,
  ExternalLink,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import {
  audioGenerationDefaults,
  createAudioGenerationSchema,
  type AudioGenerationFormValues,
} from "@/features/audio-generation/model/audio-generation-schema";
import { useAudioGeneration } from "@/features/audio-generation/hook/use-audio-generation";
import { AppButton } from "@/shared/ui/app-button";
import { GenerationCanvas } from "@/shared/ui/generation-canvas";
import { GenerationModelSection } from "@/shared/ui/generation-model-section";
import { GenerationPromptField } from "@/shared/ui/generation-prompt-field";
import { GenerationSettingsPopover } from "@/shared/ui/generation-settings-popover";
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
import { AppInput } from "@/shared/ui/app-input";
import { AppTextarea } from "@/shared/ui/app-form-control";
import {
  AppSelectContent,
  AppSelectItem,
  AppSelectRoot,
  AppSelectTrigger,
  AppSelectValue,
} from "@/shared/ui/app-select";
import { useTranslations } from "next-intl";
import { useRuntimeModelCatalog } from "@/shared/lib/hooks/use-runtime-model-catalog";
import { cn } from "@/shared/lib/utils";
import {
  getRuntimeParameterOptionLabel,
  getRuntimeParameterOptionValue,
} from "@/shared/model-catalog/parameter-options";
import {
  getRuntimeAudioParamConfig,
  getRuntimeAudioParamRange,
  resolveRuntimeAudioDefaults,
  resolveRuntimeAudioSupportsInputAudio,
  resolveRuntimeDefaultModelKey,
} from "@/shared/model-catalog/runtime-utils";
import { createRuntimeAudioSchema } from "@/shared/model-catalog/runtime-schema";
import { resolveAudioModalities } from "@/shared/model-catalog/modality";

type AudioGenerationFormProps = {
  isAuthenticated: boolean;
};

type AudioFieldName = Exclude<keyof AudioGenerationFormValues, "prompt" | "model">;

const audioFieldOrder: Record<AudioFieldName, number> = {
  modeChoice: 10,
  language: 20,
  speaker: 30,
  voice: 40,
  speed: 50,
  inputAudio: 60,
  referenceText: 70,
  seed: 80,
  streamMode: 90,
  referencePreset: 100,
  customInstruction: 110,
  voiceInstruction: 120,
  xvecOnly: 130,
  chunkSize: 140,
  temperature: 150,
  topK: 160,
  repetitionPenalty: 170,
};

const advancedAudioFields = new Set<AudioFieldName>([
  "streamMode",
  "referencePreset",
  "customInstruction",
  "voiceInstruction",
  "xvecOnly",
  "chunkSize",
  "temperature",
  "topK",
  "repetitionPenalty",
]);
const visibleAdvancedAudioFields = new Set<AudioFieldName>([
  "referencePreset",
  "customInstruction",
  "voiceInstruction",
]);

const dockChipClass =
  "inline-flex h-12 items-center gap-2 rounded-xl border border-white/12 bg-black/16 px-3 text-sm font-medium text-white/82";
const studioPreviewShellClass =
  "flex flex-col items-center px-4 pb-56 sm:px-6 lg:pb-64";
const studioResultFrameClass =
  "mt-10 min-h-[18rem] w-full max-w-6xl rounded-[1.75rem] border border-white/10 bg-[#0b0d0c]/72 shadow-[0_24px_90px_rgba(0,0,0,0.46)] sm:min-h-[24rem]";

export function AudioGenerationForm({ isAuthenticated }: AudioGenerationFormProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const tGeneration = useTranslations("generation");
  const tAudio = useTranslations("generation.audio");
  const tActions = useTranslations("common.actions");
  const tLabels = useTranslations("common.labels");
  const tValidation = useTranslations("generation.validation.audio");
  const isGuest = !isAuthenticated;
  const { audioModels: runtimeAudioModels, isLoading: isModelLoading } =
    useRuntimeModelCatalog({ enabled: !isGuest });
  const resolvedAudioModels = runtimeAudioModels;
  const hasModels = resolvedAudioModels.length > 0;
  const defaultModelKey = resolveRuntimeDefaultModelKey(resolvedAudioModels) ?? "";
  const runtimeModelMap = useMemo(
    () => new Map(resolvedAudioModels.map((model) => [model.key, model])),
    [resolvedAudioModels],
  );
  const modelCards = useMemo(
    () =>
      resolvedAudioModels.map((model) => ({
        id: model.key,
        name: model.label,
        vendor: model.vendor,
        modalities: resolveAudioModalities(model.meta),
      })),
    [resolvedAudioModels],
  );

  const staticSchema = useMemo(
    () => createAudioGenerationSchema(tValidation),
    [tValidation],
  );
  const runtimeSchema = useMemo(
    () => createRuntimeAudioSchema(resolvedAudioModels, tValidation),
    [resolvedAudioModels, tValidation],
  );
  const resolverRef = useRef<Resolver<AudioGenerationFormValues>>(
    zodResolver(staticSchema) as Resolver<AudioGenerationFormValues>,
  );
  useEffect(() => {
    resolverRef.current = zodResolver(runtimeSchema) as Resolver<AudioGenerationFormValues>;
  }, [runtimeSchema]);
  const resolver = useMemo<Resolver<AudioGenerationFormValues>>(
    () => (values, context, options) =>
      resolverRef.current(values, context, options),
    [],
  );

  const form = useForm<AudioGenerationFormValues>({
    resolver,
    defaultValues: audioGenerationDefaults,
    mode: "onChange",
  });
  const promptFromQuery = searchParams?.get("prompt") ?? "";
  const modelFromQuery = searchParams?.get("model") ?? "";
  const handleLoginRedirect = useCallback(() => {
    const queryString = searchParams.toString();
    const returnTo = `${pathname}${queryString ? `?${queryString}` : ""}`;
    router.push(buildLoginHref(returnTo));
  }, [pathname, router, searchParams]);

  const referenceTextFromQuery = searchParams?.get("referenceText") ?? "";
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

  useEffect(() => {
    const trimmed = referenceTextFromQuery.trim();
    if (!trimmed) return;
    if (form.getValues("referenceText") === trimmed) return;
    form.setValue("referenceText", trimmed, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [form, referenceTextFromQuery]);

  const promptValue = useWatch({ control: form.control, name: "prompt" }) ?? "";
  const formValues = useWatch({ control: form.control });
  const voice = useWatch({ control: form.control, name: "voice" }) ?? "";
  const speaker = useWatch({ control: form.control, name: "speaker" }) ?? "";
  const speed =
    useWatch({ control: form.control, name: "speed" }) ??
    audioGenerationDefaults.speed;
  const inputAudio =
    useWatch({ control: form.control, name: "inputAudio" }) ??
    audioGenerationDefaults.inputAudio;
  const watchedModel =
    useWatch({ control: form.control, name: "model" }) ??
    audioGenerationDefaults.model;

  const activeModel = hasModels
    ? runtimeModelMap.has(watchedModel)
      ? watchedModel
      : defaultModelKey
    : "";
  const activeRuntimeModel = runtimeModelMap.get(activeModel);
  const activeDefaults = useMemo<Partial<Record<AudioFieldName, string | number | boolean | undefined>>>(
    () => ({
      ...audioGenerationDefaults,
      ...(activeRuntimeModel ? resolveRuntimeAudioDefaults(activeRuntimeModel) : {}),
    }),
    [activeRuntimeModel],
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const parameterKeys = useMemo(() => {
    const parameters = activeRuntimeModel?.parameters ?? {};
    return Object.keys(parameters)
      .filter((key): key is AudioFieldName => key in audioFieldOrder)
      .filter((key) => {
        const config = getRuntimeAudioParamConfig(activeRuntimeModel, key);
        if (config?.ui === "hidden") return false;
        if (
          key === "inputAudio" &&
          !resolveRuntimeAudioSupportsInputAudio(activeRuntimeModel)
        ) {
          return false;
        }
        return true;
      })
      .sort((left, right) => audioFieldOrder[left] - audioFieldOrder[right]);
  }, [activeRuntimeModel]);
  const primaryParameterKeys = parameterKeys.filter(
    (key) => !advancedAudioFields.has(key),
  );
  const advancedParameterKeys = parameterKeys.filter((key) =>
    advancedAudioFields.has(key) && visibleAdvancedAudioFields.has(key),
  );
  const canSubmit =
    hasModels &&
    promptValue.trim().length > 0 &&
    !parameterKeys.some((key) => {
      const config = getRuntimeAudioParamConfig(activeRuntimeModel, key);
      if (!config?.required) return false;
      const value = formValues?.[key];
      if (typeof value === "string") return !value.trim();
      if (typeof value === "number") return !Number.isFinite(value);
      return value === undefined || value === null;
    });

  useEffect(() => {
    if (!hasModels || !defaultModelKey) return;
    const currentModel = form.getValues("model");
    if (runtimeModelMap.has(currentModel)) return;
    form.setValue("model", defaultModelKey, { shouldValidate: true });
  }, [defaultModelKey, form, hasModels, runtimeModelMap]);

  useEffect(() => {
    const model = runtimeModelMap.get(activeModel);
    if (!model) return;
    const defaults = resolveRuntimeAudioDefaults(model);
    const currentValues = form.getValues();
    const supportsInputAudio = resolveRuntimeAudioSupportsInputAudio(model);

    form.reset({
      ...audioGenerationDefaults,
      ...currentValues,
      model: activeModel,
      prompt: currentValues.prompt ?? "",
      voice: defaults.voice,
      speaker: defaults.speaker,
      speed: defaults.speed,
      seed: currentValues.seed ?? "",
      inputAudio: supportsInputAudio ? currentValues.inputAudio ?? "" : "",
      referenceText: supportsInputAudio
        ? currentValues.referenceText ?? ""
        : "",
      modeChoice: defaults.modeChoice,
      language: defaults.language,
      streamMode: defaults.streamMode,
      referencePreset: defaults.referencePreset,
      customInstruction: defaults.customInstruction,
      voiceInstruction: defaults.voiceInstruction,
      xvecOnly: defaults.xvecOnly,
      chunkSize: defaults.chunkSize,
      temperature: defaults.temperature,
      topK: defaults.topK,
      repetitionPenalty: defaults.repetitionPenalty,
    });

    if (!supportsInputAudio) {
      form.setValue("inputAudio", "", { shouldValidate: true });
      form.setValue("referenceText", "", { shouldValidate: true });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [activeModel, form, runtimeModelMap]);

  const { state, startGeneration, reset } = useAudioGeneration();
  const isGenerating =
    state.status === "pending" || state.status === "processing";
  const resultAudios = state.result?.audios ?? [];
  const hasResults = state.status === "completed" && resultAudios.length > 0;
  const primaryAudio = resultAudios[0];

  const handleSelectModel = (modelId: string) => {
    if (modelId === activeModel) return;
    if (isGenerating) {
      reset();
    }
    form.setValue("model", modelId, { shouldValidate: true });
  };

  const handleInputAudioSelection = (event: ChangeEvent<HTMLInputElement>) => {
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
      form.setValue("inputAudio", result, { shouldValidate: true });
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveInputAudio = () => {
    form.setValue("inputAudio", "", { shouldValidate: true });
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

    void form.handleSubmit((values) => {
      const resolvedVoiceDefault = String(getResolvedDefaultValue("voice") ?? "");
      const shouldSuppressLegacyVoice =
        parameterKeys.includes("speaker") &&
        typeof values.speaker === "string" &&
        Boolean(values.speaker.trim()) &&
        typeof values.voice === "string" &&
        values.voice.trim() === resolvedVoiceDefault.trim();

      const resolvedValues: AudioGenerationFormValues = {
        ...values,
        voice:
          shouldSuppressLegacyVoice
            ? ""
            : parameterKeys.includes("voice")
            ? !(values.voice ?? "").trim()
              ? resolvedVoiceDefault
              : values.voice
            : "",
        speaker:
          parameterKeys.includes("speaker") && !(values.speaker ?? "").trim()
            ? String(getResolvedDefaultValue("speaker") ?? "")
            : values.speaker,
        modeChoice:
          parameterKeys.includes("modeChoice") && !(values.modeChoice ?? "").trim()
            ? String(getResolvedDefaultValue("modeChoice") ?? "")
            : values.modeChoice,
        language:
          parameterKeys.includes("language") && !(values.language ?? "").trim()
            ? String(getResolvedDefaultValue("language") ?? "")
            : values.language,
        referencePreset:
          parameterKeys.includes("referencePreset") &&
          !(values.referencePreset ?? "").trim()
            ? String(getResolvedDefaultValue("referencePreset") ?? "")
            : values.referencePreset,
        streamMode:
          parameterKeys.includes("streamMode") &&
          typeof values.streamMode !== "boolean"
            ? Boolean(getResolvedDefaultValue("streamMode"))
            : values.streamMode,
        xvecOnly:
          parameterKeys.includes("xvecOnly") &&
          typeof values.xvecOnly !== "boolean"
            ? Boolean(getResolvedDefaultValue("xvecOnly"))
            : values.xvecOnly,
        chunkSize:
          parameterKeys.includes("chunkSize") &&
          typeof values.chunkSize !== "number"
            ? Number(getResolvedDefaultValue("chunkSize"))
            : values.chunkSize,
        temperature:
          parameterKeys.includes("temperature") &&
          typeof values.temperature !== "number"
            ? Number(getResolvedDefaultValue("temperature"))
            : values.temperature,
        topK:
          parameterKeys.includes("topK") && typeof values.topK !== "number"
            ? Number(getResolvedDefaultValue("topK"))
            : values.topK,
        repetitionPenalty:
          parameterKeys.includes("repetitionPenalty") &&
          typeof values.repetitionPenalty !== "number"
            ? Number(getResolvedDefaultValue("repetitionPenalty"))
            : values.repetitionPenalty,
      };
      startGeneration(resolvedValues);
    })(event);
  };

  const getFieldLabel = (key: AudioFieldName) => {
    const config = getRuntimeAudioParamConfig(activeRuntimeModel, key);
    switch (key) {
      case "voice":
        return tAudio("voiceLabel");
      case "referenceText":
        return tAudio("referenceTextLabel");
      case "speed":
        return tAudio("speedLabel");
      case "seed":
        return tLabels("seed");
      case "modeChoice":
        return "Mode";
      case "language":
        return "Language";
      case "speaker":
        return "Speaker";
      case "streamMode":
        return "Live output";
      case "referencePreset":
        return "Voice sample";
      case "customInstruction":
        return "Notes";
      case "voiceInstruction":
        return "Voice style";
      case "xvecOnly":
        return "Voice match";
      case "chunkSize":
        return "Detail";
      case "temperature":
        return "Variation";
      case "topK":
        return "Clarity";
      case "repetitionPenalty":
        return "Repetition";
      case "inputAudio":
        return "Sample audio";
      default:
        return typeof config?.label === "string" && config.label.trim()
          ? config.label
          : key;
    }
  };

  const getFieldTextareaPlaceholder = () => "";

  const getFieldInputPlaceholder = () => "";

  const getResolvedDefaultValue = (key: AudioFieldName) => {
    const config = getRuntimeAudioParamConfig(activeRuntimeModel, key);
    if (config?.ui === "select") {
      if (typeof config.default === "string" || typeof config.default === "number") {
        return String(config.default);
      }
      const firstOptionValue = getRuntimeParameterOptionValue(config.options?.[0]);
      if (typeof firstOptionValue === "string" || typeof firstOptionValue === "number") {
        return String(firstOptionValue);
      }
      return "";
    }
    if (config?.ui === "range") {
      return typeof config.default === "number"
        ? config.default
        : getRuntimeAudioParamRange(activeRuntimeModel, key).min;
    }
    if (config?.ui === "toggle") {
      return typeof config.default === "boolean" ? config.default : false;
    }
    if (typeof config?.default === "string") {
      return config.default;
    }
    if (key === "voice") {
      return activeDefaults.voice;
    }
    return activeDefaults[key];
  };

  const renderAudioField = (key: AudioFieldName) => {
    const config = getRuntimeAudioParamConfig(activeRuntimeModel, key);
    if (!config || config.ui === "hidden") return null;
    const label = getFieldLabel(key);

    if (key === "inputAudio") {
      return (
        <AppFormControllerField
          key={`${activeModel}-${key}`}
          control={form.control}
          name={key}
          render={() => (
            <AppFormItem className="flex flex-col gap-3">
              <AppFormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                {label}
              </AppFormLabel>
              <AppFormControl>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  aria-label={label}
                  onChange={handleInputAudioSelection}
                  className="block w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                />
              </AppFormControl>
              {inputAudio ? (
                <div className="flex flex-col gap-2">
                  <audio
                    src={inputAudio}
                    controls
                    className="w-full rounded-lg border border-white/10 bg-black/60"
                  />
                  <AppButton
                    type="button"
                    variant="surface"
                    size="sm"
                    onClick={handleRemoveInputAudio}
                    className="self-start"
                  >
                    {tActions("remove")}
                  </AppButton>
                </div>
              ) : null}
              <AppFormMessage className="text-xs text-red-400" />
            </AppFormItem>
          )}
        />
      );
    }

    if (config.ui === "range") {
      const range = getRuntimeAudioParamRange(activeRuntimeModel, key);
      return (
        <AppFormControllerField
          key={`${activeModel}-${key}`}
          control={form.control}
          name={key}
          render={({ field }) => (
            <AppFormItem className="flex flex-col gap-3">
              {(() => {
                const effectiveValue =
                  typeof field.value === "number"
                    ? field.value
                    : typeof getResolvedDefaultValue(key) === "number"
                      ? Number(getResolvedDefaultValue(key))
                      : range.min;
                return (
                  <>
              <div className="flex items-center justify-between">
                <AppFormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                  {label}
                </AppFormLabel>
                <span className="rounded border border-white/10 bg-surface-lighter px-2 py-0.5 text-xs font-bold text-white font-mono">
                  {effectiveValue}
                </span>
              </div>
              <AppFormControl>
                <input
                  type="range"
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  value={effectiveValue}
                  onChange={(event) => field.onChange(Number(event.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface-lighter"
                />
              </AppFormControl>
              <AppFormMessage className="text-xs text-red-400" />
                  </>
                );
              })()}
            </AppFormItem>
          )}
        />
      );
    }

    if (config.ui === "select") {
      const options = Array.isArray(config.options) ? config.options : [];
      return (
        <AppFormControllerField
          key={`${activeModel}-${key}`}
          control={form.control}
          name={key}
          render={({ field }) => (
            <AppFormItem className="flex flex-col gap-2">
              <AppFormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                {label}
              </AppFormLabel>
              <AppSelectRoot
                value={
                  field.value
                    ? String(field.value)
                    : typeof getResolvedDefaultValue(key) === "string"
                      ? String(getResolvedDefaultValue(key))
                      : ""
                }
                onValueChange={(nextValue) => field.onChange(nextValue)}
              >
                <AppFormControl>
                  <AppSelectTrigger surface="toolbar">
                    <AppSelectValue placeholder={label} />
                  </AppSelectTrigger>
                </AppFormControl>
                <AppSelectContent>
                  {options.map((option) => (
                    <AppSelectItem
                      key={String(getRuntimeParameterOptionValue(option))}
                      value={String(getRuntimeParameterOptionValue(option))}
                    >
                      {getRuntimeParameterOptionLabel(option)}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelectRoot>
              <AppFormMessage className="text-xs text-red-400" />
            </AppFormItem>
          )}
        />
      );
    }

    if (config.ui === "toggle") {
      return (
        <AppFormControllerField
          key={`${activeModel}-${key}`}
          control={form.control}
          name={key}
          render={({ field }) => {
            const isEnabled =
              typeof field.value === "boolean"
                ? field.value
                : Boolean(getResolvedDefaultValue(key));
            return (
              <AppFormItem className="flex items-center justify-between gap-4">
                <AppFormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                  {label}
                </AppFormLabel>
                <AppFormControl>
                  <AppButton
                    type="button"
                    variant={isEnabled ? "primary" : "surface"}
                    size="sm"
                    aria-pressed={isEnabled}
                    onClick={() => field.onChange(!isEnabled)}
                    className={cn(
                      "h-8 px-3 text-xs font-bold uppercase tracking-wider",
                      isEnabled ? "text-black" : "text-gray-300",
                    )}
                  >
                    {isEnabled ? "On" : "Off"}
                  </AppButton>
                </AppFormControl>
              </AppFormItem>
            );
          }}
        />
      );
    }

    if (config.ui === "textarea") {
      return (
        <AppFormControllerField
          key={`${activeModel}-${key}`}
          control={form.control}
          name={key}
          render={({ field }) => (
            <AppFormItem className="flex flex-col gap-2">
              <AppFormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                {label}
              </AppFormLabel>
              <AppFormControl>
                <AppTextarea
                  {...field}
                  value={typeof field.value === "string" ? field.value : ""}
                  placeholder={getFieldTextareaPlaceholder()}
                  className="min-h-[96px]"
                />
              </AppFormControl>
              <AppFormMessage className="text-xs text-red-400" />
            </AppFormItem>
          )}
        />
      );
    }

    return (
      <AppFormControllerField
        key={`${activeModel}-${key}`}
        control={form.control}
        name={key}
        render={({ field }) => (
          <AppFormItem className="flex flex-col gap-2">
            <AppFormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
              {label}
            </AppFormLabel>
            <AppFormControl>
              <AppInput
                {...field}
                value={typeof field.value === "string" ? field.value : ""}
                placeholder={getFieldInputPlaceholder()}
              />
            </AppFormControl>
            <AppFormMessage className="text-xs text-red-400" />
          </AppFormItem>
        )}
      />
    );
  };

  return (
    <AppForm {...form}>
      <form
        className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 pb-36"
        onSubmit={handleFormSubmit}
      >
        <div className="flex flex-col gap-6">
          <div className={studioPreviewShellClass}>
            <GenerationStudioIntro
              eyebrow={tAudio("previewEyebrow")}
              title={tAudio("previewTitle")}
              description={tAudio("previewDescription")}
            />
            <GenerationCanvas
              isGenerating={isGenerating}
              status={state.status}
              errorMessage={state.errorMessage}
              className={studioResultFrameClass}
            >
              {hasResults && primaryAudio ? (
                <div className="relative z-10 flex w-full max-w-3xl flex-col gap-3 px-6">
                  <audio
                    src={primaryAudio.url}
                    controls
                    className="w-full rounded-lg border border-white/10 bg-black/60"
                  />
                </div>
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

          {hasResults && resultAudios.length > 0 ? (
            <div className="flex flex-col gap-2">
              {resultAudios.map((audio, index) => {
                const downloadUrl = state.requestId
                  ? `/api/audio-generation/${state.requestId}/download?index=${index}`
                  : null;

                return (
                  <div
                    key={`${audio.url}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-surface-dark/60 px-3 py-2"
                  >
                    <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
                      #{index + 1}
                      {typeof audio.durationSec === "number"
                        ? ` • ${audio.durationSec}s`
                        : ""}
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={audio.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-surface-dark/80 text-gray-200 transition-colors hover:border-primary hover:text-white"
                        title={tActions("open")}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      {downloadUrl ? (
                        <a
                          href={downloadUrl}
                          download
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-surface-dark/80 text-gray-200 transition-colors hover:border-primary hover:text-white"
                          title={tActions("download")}
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <AppFormControllerField
            control={form.control}
            name="prompt"
            render={({ field }) => (
              <AppFormItem className="flex-1">
                <GenerationPromptField
                  ariaLabel={tGeneration("promptDock.label")}
                  surface="hero"
                  className="fixed inset-x-4 bottom-5 z-40 mx-auto max-w-6xl"
                  textarea={
                    <AppFormControl>
                      <AppTextarea
                        surface="transparent"
                        className="min-h-[104px]"
                        {...field}
                      />
                    </AppFormControl>
                  }
                  promptMeta={tLabels("chars", { count: promptValue.length })}
                  footerLeft={
                    <>
                      {!isGuest && hasModels ? (
                        <GenerationModelSection
                          modality="audio"
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
                      <GenerationSettingsPopover
                        label={tLabels("settings")}
                        summary={
                          parameterKeys.includes("speaker") && speaker?.trim()
                            ? speaker.trim()
                            : parameterKeys.includes("voice") &&
                                voice?.trim() &&
                                voice !== activeDefaults.voice
                              ? voice
                              : `${speed}x`
                        }
                        icon={<SlidersHorizontal className="h-4 w-4" />}
                      >
                        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
                          {primaryParameterKeys.map((key) => renderAudioField(key))}
                          {advancedParameterKeys.length > 0 ? (
                            <>
                              <div className="h-px bg-white/5" />
                              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                                {tLabels("moreControls")}
                              </div>
                              {advancedParameterKeys.map((key) =>
                                renderAudioField(key),
                              )}
                            </>
                          ) : null}
                        </div>
                      </GenerationSettingsPopover>
                    </>
                  }
                  footerRight={
                    <>
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
                            : handleLoginRedirect
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
                <AppFormMessage className="text-xs text-red-400" />
              </AppFormItem>
            )}
          />
        </div>
      </form>
    </AppForm>
  );
}
