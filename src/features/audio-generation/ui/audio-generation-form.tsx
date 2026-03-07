"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AudioLines,
  Download,
  ExternalLink,
  Grid2x2,
  Maximize2,
  Sparkles,
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
  audioGenerationDefaults,
  createAudioGenerationSchema,
  type AudioGenerationFormValues,
} from "@/features/audio-generation/model/audio-generation-schema";
import { useAudioGeneration } from "@/features/audio-generation/hook/use-audio-generation";
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
  FormLabel,
  FormMessage,
} from "@/shared/ui/form";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
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

export function AudioGenerationForm({ isAuthenticated }: AudioGenerationFormProps) {
  const searchParams = useSearchParams();
  const tGeneration = useTranslations("generation");
  const tAudio = useTranslations("generation.audio");
  const tActions = useTranslations("common.actions");
  const tLabels = useTranslations("common.labels");
  const tGenerationActions = useTranslations("generation.actions");
  const tValidation = useTranslations("generation.validation.audio");
  const tLoginGate = useTranslations("auth.loginGate");

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
  const [isLoginGateOpen, setIsLoginGateOpen] = useState(false);

  const promptFromQuery = searchParams?.get("prompt") ?? "";
  const modelFromQuery = searchParams?.get("model") ?? "";
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
    advancedAudioFields.has(key),
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

  const resetModelKey = defaultModelKey || audioGenerationDefaults.model;
  const resetDefaults = useMemo<AudioGenerationFormValues>(() => {
    const model = runtimeModelMap.get(resetModelKey);
    if (!model) return { ...audioGenerationDefaults, model: resetModelKey };
    const defaults = resolveRuntimeAudioDefaults(model);
    return {
      ...audioGenerationDefaults,
      model: resetModelKey,
      voice: defaults.voice,
      speaker: defaults.speaker,
      speed: defaults.speed,
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
      inputAudio: "",
      referenceText: "",
    };
  }, [resetModelKey, runtimeModelMap]);

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

  const handleReset = () => {
    form.reset(resetDefaults);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    reset();
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
      setIsLoginGateOpen(true);
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
    if (typeof config?.label === "string" && config.label.trim()) {
      return config.label;
    }
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
        return "Generation Mode";
      case "language":
        return "Language";
      case "speaker":
        return "Speaker";
      case "streamMode":
        return "Streaming";
      case "referencePreset":
        return "Reference Preset";
      case "customInstruction":
        return "Custom Instruction";
      case "voiceInstruction":
        return "Voice Instruction";
      case "xvecOnly":
        return "xvec only";
      case "chunkSize":
        return "Chunk Size";
      case "temperature":
        return "Temperature";
      case "topK":
        return "Top K";
      case "repetitionPenalty":
        return "Repetition Penalty";
      case "inputAudio":
        return "Reference Audio";
      default:
        return key;
    }
  };

  const getFieldTextareaPlaceholder = (key: AudioFieldName) => {
    if (key === "referenceText") return tAudio("referenceTextPlaceholder");
    if (key === "customInstruction") return "Describe how the generated voice should behave.";
    if (key === "voiceInstruction") return "Describe the target voice style.";
    return "";
  };

  const getFieldInputPlaceholder = (key: AudioFieldName) => {
    if (key === "voice") return tAudio("voicePlaceholder");
    if (key === "seed") return tAudio("seedPlaceholder");
    return "";
  };

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
        <FormField
          key={`${activeModel}-${key}`}
          control={form.control}
          name={key}
          render={() => (
            <FormItem className="flex flex-col gap-3">
              <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                {label}
              </FormLabel>
              <FormControl>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  aria-label={label}
                  onChange={handleInputAudioSelection}
                  className="block w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                />
              </FormControl>
              {inputAudio ? (
                <div className="flex flex-col gap-2">
                  <audio
                    src={inputAudio}
                    controls
                    className="w-full rounded-lg border border-white/10 bg-black/60"
                  />
                  <Button
                    type="button"
                    variant="surface"
                    size="sm"
                    onClick={handleRemoveInputAudio}
                    className="self-start"
                  >
                    {tActions("remove")}
                  </Button>
                </div>
              ) : null}
              <FormMessage className="text-xs text-red-400" />
            </FormItem>
          )}
        />
      );
    }

    if (config.ui === "range") {
      const range = getRuntimeAudioParamRange(activeRuntimeModel, key);
      return (
        <FormField
          key={`${activeModel}-${key}`}
          control={form.control}
          name={key}
          render={({ field }) => (
            <FormItem className="flex flex-col gap-3">
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
                <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                  {label}
                </FormLabel>
                <span className="rounded border border-white/10 bg-surface-lighter px-2 py-0.5 text-xs font-bold text-white font-mono">
                  {effectiveValue}
                </span>
              </div>
              <FormControl>
                <input
                  type="range"
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  value={effectiveValue}
                  onChange={(event) => field.onChange(Number(event.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface-lighter"
                />
              </FormControl>
              <FormMessage className="text-xs text-red-400" />
                  </>
                );
              })()}
            </FormItem>
          )}
        />
      );
    }

    if (config.ui === "select") {
      const options = Array.isArray(config.options) ? config.options : [];
      return (
        <FormField
          key={`${activeModel}-${key}`}
          control={form.control}
          name={key}
          render={({ field }) => (
            <FormItem className="flex flex-col gap-2">
              <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                {label}
              </FormLabel>
              <Select
                value={
                  field.value
                    ? String(field.value)
                    : typeof getResolvedDefaultValue(key) === "string"
                      ? String(getResolvedDefaultValue(key))
                      : ""
                }
                onValueChange={(nextValue) => field.onChange(nextValue)}
              >
                <FormControl>
                  <SelectTrigger className="h-11 rounded-xl border-white/10 bg-black/40 px-4 text-sm text-white">
                    <SelectValue placeholder={label} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem
                      key={String(getRuntimeParameterOptionValue(option))}
                      value={String(getRuntimeParameterOptionValue(option))}
                    >
                      {getRuntimeParameterOptionLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage className="text-xs text-red-400" />
            </FormItem>
          )}
        />
      );
    }

    if (config.ui === "toggle") {
      return (
        <FormField
          key={`${activeModel}-${key}`}
          control={form.control}
          name={key}
          render={({ field }) => {
            const isEnabled =
              typeof field.value === "boolean"
                ? field.value
                : Boolean(getResolvedDefaultValue(key));
            return (
              <FormItem className="flex items-center justify-between gap-4">
                <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                  {label}
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
                    {isEnabled ? "On" : "Off"}
                  </Button>
                </FormControl>
              </FormItem>
            );
          }}
        />
      );
    }

    if (config.ui === "textarea") {
      return (
        <FormField
          key={`${activeModel}-${key}`}
          control={form.control}
          name={key}
          render={({ field }) => (
            <FormItem className="flex flex-col gap-2">
              <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                {label}
              </FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  value={typeof field.value === "string" ? field.value : ""}
                  placeholder={getFieldTextareaPlaceholder(key)}
                  className="min-h-[96px] rounded-xl border-white/10 bg-black/40 px-4 py-3 text-sm text-white"
                />
              </FormControl>
              <FormMessage className="text-xs text-red-400" />
            </FormItem>
          )}
        />
      );
    }

    return (
      <FormField
        key={`${activeModel}-${key}`}
        control={form.control}
        name={key}
        render={({ field }) => (
          <FormItem className="flex flex-col gap-2">
            <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
              {label}
            </FormLabel>
            <FormControl>
              <Input
                {...field}
                value={typeof field.value === "string" ? field.value : ""}
                placeholder={getFieldInputPlaceholder(key)}
                className="h-11 rounded-xl border-white/10 bg-black/40 px-4 text-sm text-white"
              />
            </FormControl>
            <FormMessage className="text-xs text-red-400" />
          </FormItem>
        )}
      />
    );
  };

  return (
    <Form {...form}>
      <form className="flex flex-col gap-8" onSubmit={handleFormSubmit}>
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
              {hasResults && primaryAudio ? (
                <div className="z-10 flex w-full max-w-3xl flex-col gap-3 px-6">
                  <audio
                    src={primaryAudio.url}
                    controls
                    className="w-full rounded-lg border border-white/10 bg-black/60"
                  />
                </div>
              ) : (
                <div className="z-10 flex flex-col items-center px-6 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-surface-dark shadow-[0_0_30px_rgba(212,240,50,0.05)]">
                    <AudioLines className="h-8 w-8 text-gray-600" />
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

            {hasResults && resultAudios.length > 0 ? (
              <div className="flex flex-col gap-2">
                {resultAudios.map((audio, index) => (
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
                      <a
                        href={audio.url}
                        download
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-surface-dark/80 text-gray-200 transition-colors hover:border-primary hover:text-white"
                        title={tActions("download")}
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

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
                            placeholder={tAudio("promptPlaceholder")}
                            className="min-h-[120px] border-none bg-transparent px-4 py-4 text-white placeholder:text-gray-600 focus-visible:ring-0"
                            {...field}
                          />
                        </FormControl>
                      }
                      footerLeft={
                        <span className="text-[10px] font-mono text-gray-600">
                          {(speaker || voice)?.trim()
                            ? `${speaker?.trim() ? "Speaker" : tAudio("voiceLabel")}: ${speaker?.trim() || voice}`
                            : tAudio("voiceUnset")}
                        </span>
                      }
                      footerRight={
                        <span className="text-[10px] font-mono text-gray-600">
                          {tLabels("chars", { count: promptValue.length })}
                        </span>
                      }
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
                  (isAuthenticated && (isModelLoading || !hasModels || !canSubmit))
                }
                className="flex-col"
                onClick={
                  isAuthenticated ? undefined : () => setIsLoginGateOpen(true)
                }
              >
                <Sparkles className="h-7 w-7" />
                {isGenerating ? tActions("generating") : tActions("generate")}
              </Button>
            </div>
          </div>

          <GenerationSettingsPanel onReset={handleReset}>
            <div className="flex flex-col gap-8">
              {primaryParameterKeys.map((key) => renderAudioField(key))}
              {advancedParameterKeys.length > 0 ? (
                <>
                  <div className="h-px bg-white/5" />
                  <div className="flex flex-col gap-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                      Advanced Settings
                    </div>
                    <div className="flex flex-col gap-6">
                      {advancedParameterKeys.map((key) => renderAudioField(key))}
                    </div>
                  </div>
                </>
              ) : null}
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
