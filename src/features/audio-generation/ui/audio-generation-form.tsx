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
import { Textarea } from "@/shared/ui/textarea";
import { useTranslations } from "next-intl";
import { useRuntimeModelCatalog } from "@/shared/lib/hooks/use-runtime-model-catalog";
import {
  getRuntimeAudioParamConfig,
  getRuntimeAudioParamRange,
  resolveRuntimeAudioDefaults,
  resolveRuntimeDefaultModelKey,
} from "@/shared/model-catalog/runtime-utils";
import { createRuntimeAudioSchema } from "@/shared/model-catalog/runtime-schema";
import { resolveAudioModalities } from "@/shared/model-catalog/modality";

type AudioGenerationFormProps = {
  isAuthenticated: boolean;
};

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
  const speed =
    useWatch({ control: form.control, name: "speed" }) ??
    audioGenerationDefaults.speed;
  const voice = useWatch({ control: form.control, name: "voice" }) ?? "";
  const watchedModel =
    useWatch({ control: form.control, name: "model" }) ??
    audioGenerationDefaults.model;

  const activeModel = hasModels
    ? runtimeModelMap.has(watchedModel)
      ? watchedModel
      : defaultModelKey
    : "";
  const activeRuntimeModel = runtimeModelMap.get(activeModel);

  const speedRange = getRuntimeAudioParamRange(activeRuntimeModel, "speed");
  const speedConfig = getRuntimeAudioParamConfig(activeRuntimeModel, "speed");
  const voiceConfig = getRuntimeAudioParamConfig(activeRuntimeModel, "voice");
  const seedConfig = getRuntimeAudioParamConfig(activeRuntimeModel, "seed");
  const showSpeed = speedConfig?.ui !== "hidden";
  const showVoice = voiceConfig?.ui !== "hidden";
  const showSeed = seedConfig?.ui !== "hidden";

  const canSubmit = hasModels && promptValue.trim().length > 0;

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
    form.setValue("voice", defaults.voice);
    form.setValue("speed", defaults.speed);

    if (!showSeed) {
      form.setValue("seed", "");
    }
  }, [activeModel, form, runtimeModelMap, showSeed]);

  const resetModelKey = defaultModelKey || audioGenerationDefaults.model;
  const resetDefaults = useMemo<AudioGenerationFormValues>(() => {
    const model = runtimeModelMap.get(resetModelKey);
    if (!model) return { ...audioGenerationDefaults, model: resetModelKey };
    const defaults = resolveRuntimeAudioDefaults(model);
    return {
      ...audioGenerationDefaults,
      model: resetModelKey,
      voice: defaults.voice,
      speed: defaults.speed,
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
                          {voice?.trim() ? `${tAudio("voiceLabel")}: ${voice}` : tAudio("voiceUnset")}
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
              {showSpeed ? (
                <FormField
                  control={form.control}
                  name="speed"
                  render={({ field }) => (
                    <FormItem className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                          {tAudio("speedLabel")}
                        </span>
                        <span className="rounded border border-white/10 bg-surface-lighter px-2 py-0.5 text-xs font-bold text-white font-mono">
                          {field.value?.toFixed(2)}x
                        </span>
                      </div>
                      <FormControl>
                        <input
                          type="range"
                          min={speedRange.min}
                          max={speedRange.max}
                          step={speedRange.step}
                          value={field.value ?? speed}
                          onChange={(event) =>
                            field.onChange(Number(event.target.value))
                          }
                          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface-lighter"
                        />
                      </FormControl>
                      <div className="flex justify-between px-1 text-[10px] font-mono text-gray-600">
                        <span>{speedRange.min.toFixed(2)}x</span>
                        <span>{speedRange.max.toFixed(2)}x</span>
                      </div>
                      <FormMessage className="text-xs text-red-400" />
                    </FormItem>
                  )}
                />
              ) : null}

              {showVoice ? (
                <FormField
                  control={form.control}
                  name="voice"
                  render={({ field }) => (
                    <FormItem className="flex flex-col gap-2">
                      <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                        {tAudio("voiceLabel")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder={tAudio("voicePlaceholder")}
                          className="h-11 rounded-xl border-white/10 bg-black/40 px-4 text-sm text-white"
                        />
                      </FormControl>
                      <FormMessage className="text-xs text-red-400" />
                    </FormItem>
                  )}
                />
              ) : null}

              {showSeed ? (
                <FormField
                  control={form.control}
                  name="seed"
                  render={({ field }) => (
                    <FormItem className="flex flex-col gap-2">
                      <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                        {tLabels("seed")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder={tAudio("seedPlaceholder")}
                          className="h-11 rounded-xl border-white/10 bg-black/40 px-4 text-sm text-white"
                        />
                      </FormControl>
                      <FormMessage className="text-xs text-red-400" />
                    </FormItem>
                  )}
                />
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
