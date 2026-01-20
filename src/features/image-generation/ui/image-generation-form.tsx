"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
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
import { LoginGateDialog } from "@/shared/ui/login-gate-dialog";
import {
  imageGenerationDefaults,
  createImageGenerationSchema,
  type ImageGenerationModel,
  modelDefaults,
  modelImageLimits,
  type ImageGenerationFormValues,
} from "@/features/image-generation/model/image-generation-schema";
import {
  getImageParamConfig,
  getImageParamRange,
  imageModels,
} from "@/features/image-generation/model/image-models";
import { useImageGeneration } from "@/features/image-generation/hook/use-image-generation";
import { useImageInitPreviews } from "@/features/image-generation/hook/use-image-init-previews";
import { useTranslations } from "next-intl";

const modelOptions = imageModels.map((model, index) => ({
  id: model.key as ImageGenerationModel,
  name: model.label,
  vendor: model.vendor,
  active: index === 0,
})) as ReadonlyArray<{
  id: ImageGenerationModel;
  name: string;
  vendor: string;
  active: boolean;
}>;

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
  const schema = useMemo(
    () => createImageGenerationSchema(tValidation),
    [tValidation],
  );
  const form = useForm<ImageGenerationFormValues>({
    resolver: zodResolver(schema),
    defaultValues: imageGenerationDefaults,
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
  const width =
    useWatch({ control: form.control, name: "width" }) ??
    imageGenerationDefaults.width;
  const height =
    useWatch({ control: form.control, name: "height" }) ??
    imageGenerationDefaults.height;
  const steps =
    useWatch({ control: form.control, name: "steps" }) ??
    imageGenerationDefaults.steps;
  const activeModel =
    useWatch({ control: form.control, name: "model" }) ??
    imageGenerationDefaults.model;

  const widthRange = getImageParamRange(activeModel, "width");
  const heightRange = getImageParamRange(activeModel, "height");
  const stepsRange = getImageParamRange(activeModel, "steps");
  const widthConfig = getImageParamConfig(activeModel, "width");
  const heightConfig = getImageParamConfig(activeModel, "height");
  const stepsConfig = getImageParamConfig(activeModel, "steps");
  const seedConfig = getImageParamConfig(activeModel, "seed");
  const showSizeControls =
    widthConfig?.ui !== "hidden" || heightConfig?.ui !== "hidden";
  const showSteps = stepsConfig?.ui !== "hidden";
  const showSeed = seedConfig?.ui !== "hidden";
  const maxInputImages = modelImageLimits[activeModel]?.maxInputImages ?? 0;
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
    removeImage: handleRemoveInitImage,
    reset: resetInitImagePreviews,
  } = useImageInitPreviews({
    maxInputImages,
    onChange: handleInitImagesChange,
  });

  useEffect(() => {
    const defaults = modelDefaults[activeModel];
    form.setValue("steps", defaults.steps);
    form.setValue("width", defaults.width);
    form.setValue("height", defaults.height);

    const seedCfg = getImageParamConfig(activeModel, "seed");
    if (seedCfg?.ui === "hidden") {
      form.setValue("seed", "");
    }
  }, [activeModel, form]);

  const { state, startGeneration, reset } = useImageGeneration();
  const isGenerating =
    state.status === "pending" || state.status === "processing";
  const progressValue = Math.min(100, Math.max(0, Math.round(state.progress)));
  const resultImages = state.result?.images ?? [];
  const hasResults = state.status === "completed" && resultImages.length > 0;

  const handleSelectModel = (modelId: ImageGenerationModel) => {
    form.setValue("model", modelId);
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

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!isAuthenticated) {
      event.preventDefault();
      setIsLoginGateOpen(true);
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
              progressValue={progressValue}
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
                  disabled={isGenerating}
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
              form.reset(imageGenerationDefaults);
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

              {showSteps && (
                <div className="flex flex-col gap-6">
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
                </div>
              )}

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
