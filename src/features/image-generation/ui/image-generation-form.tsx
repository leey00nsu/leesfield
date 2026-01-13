"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dice5,
  ImagePlus,
  Image as ImageIcon,
  Maximize2,
  Grid2x2,
  RotateCcw,
  Sparkles,
  Download,
  ExternalLink,
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
import {
  imageGenerationDefaults,
  imageGenerationSchema,
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

export function ImageGenerationForm() {
  const searchParams = useSearchParams();
  const form = useForm<ImageGenerationFormValues>({
    resolver: zodResolver(imageGenerationSchema),
    defaultValues: imageGenerationDefaults,
    mode: "onChange",
  });

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

  const promptValue = form.watch("prompt") ?? "";
  const width = form.watch("width") ?? imageGenerationDefaults.width;
  const height = form.watch("height") ?? imageGenerationDefaults.height;
  const steps = form.watch("steps") ?? imageGenerationDefaults.steps;
  const activeModel = form.watch("model") ?? imageGenerationDefaults.model;
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
  const [initImagePreviews, setInitImagePreviews] = useState<
    Array<{ id: string; url: string; dataUrl: string }>
  >([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const maxInputImages =
    modelImageLimits[activeModel]?.maxInputImages ?? 0;
  const canUploadImages = maxInputImages > 0;

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

  useEffect(() => {
    if (!canUploadImages) {
      setInitImagePreviews((prev) => {
        if (prev.length === 0) return prev;
        form.setValue("initImages", []);
        return [];
      });
      return;
    }

    if (initImagePreviews.length > maxInputImages) {
      setInitImagePreviews((prev) => {
        if (prev.length <= maxInputImages) return prev;
        const next = prev.slice(0, maxInputImages);
        form.setValue(
          "initImages",
          next.map((item) => item.dataUrl),
        );
        return next;
      });
    }
  }, [canUploadImages, initImagePreviews.length, maxInputImages, form]);

  const { state, startGeneration, reset } = useImageGeneration();
  const isGenerating =
    state.status === "pending" || state.status === "processing";
  const progressValue = Math.min(100, Math.max(0, Math.round(state.progress)));
  const resultImages = state.result?.images ?? [];
  const hasResults = state.status === "completed" && resultImages.length > 0;

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

  const handleOpenImagePicker = () => {
    if (!canUploadImages || initImagePreviews.length >= maxInputImages) {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleImageSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length || !canUploadImages) {
      event.target.value = "";
      return;
    }

    const remaining = Math.max(0, maxInputImages - initImagePreviews.length);
    const selected = files.slice(0, remaining);

    const dataUrls = await Promise.all(
      selected.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () =>
              reject(new Error("이미지 업로드에 실패했습니다."));
            reader.readAsDataURL(file);
          }),
      ),
    );

    const next = [
      ...initImagePreviews,
      ...dataUrls.map((dataUrl) => ({
        id: crypto.randomUUID(),
        url: dataUrl,
        dataUrl,
      })),
    ];

    setInitImagePreviews(next);
    form.setValue(
      "initImages",
      next.map((item) => item.dataUrl),
      { shouldValidate: true },
    );

    event.target.value = "";
  };

  const handleRemoveInitImage = (id: string) => {
    const next = initImagePreviews.filter((item) => item.id !== id);
    setInitImagePreviews(next);
    form.setValue(
      "initImages",
      next.map((item) => item.dataUrl),
      { shouldValidate: true },
    );
  };
  const resultsGridClass =
    resultImages.length <= 1
      ? "grid-cols-1"
      : resultImages.length === 2
        ? "grid-cols-2"
        : "grid-cols-2 lg:grid-cols-3";

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-8"
        onSubmit={form.handleSubmit((values) => startGeneration(values))}
      >
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 font-mono">
              Select_Model
            </h3>
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs font-bold uppercase text-primary hover:underline"
            >
              View All Models
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modelOptions.map((model) => (
              <Button
                key={model.id}
                type="button"
                onClick={() => form.setValue("model", model.id)}
                variant="ghost"
                className={cn(
                  "group relative h-auto w-full flex-col rounded-xl bg-surface-dark p-1 text-left transition-all hover:bg-surface-dark",
                  activeModel === model.id
                    ? "border-2 border-primary"
                    : "border border-white/5 hover:border-white/20",
                )}
              >
                <div className="relative h-24 w-full overflow-hidden rounded-lg bg-black">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-black/70 to-black opacity-60 transition-opacity group-hover:opacity-80" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute bottom-2 left-3">
                    <div className="text-sm font-bold text-white">
                      {model.name}
                    </div>
                    <div className="text-[10px] font-mono text-primary">
                      {model.vendor}
                    </div>
                  </div>
                </div>
                {activeModel === model.id && (
                  <div className="absolute right-3 top-3 rounded-full bg-black/50 p-1 text-primary">
                    <Sparkles className="h-4 w-4" />
                  </div>
                )}
              </Button>
            ))}
          </div>
        </section>

        <div className="flex flex-col gap-8 xl:flex-row">
          <div className="flex flex-1 flex-col gap-6">
            <div className="group relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-white/10 bg-black/40">
              <div className="absolute inset-0 bg-[radial-gradient(circle,_#333_1px,_transparent_1px)] opacity-20" />
              <div className="absolute right-4 top-4 flex gap-2">
                <Button
                  type="button"
                  variant="surface"
                  size="icon"
                  className="border-white/10 bg-surface-dark/80 text-gray-400 hover:border-white/30 hover:text-white"
                  title="Toggle Grid"
                >
                  <Grid2x2 className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  variant="surface"
                  size="icon"
                  className="border-white/10 bg-surface-dark/80 text-gray-400 hover:border-white/30 hover:text-white"
                  title="Full Screen"
                >
                  <Maximize2 className="h-5 w-5" />
                </Button>
              </div>
              {hasResults ? (
                <div
                  className={cn(
                    "relative z-10 grid h-full w-full gap-3 p-4",
                    resultsGridClass,
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
                        <img
                          src={image.url}
                          alt={`Generated image ${index + 1}`}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover/result:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 transition-opacity group-hover/result:opacity-100" />
                        <div className="absolute bottom-3 right-3 flex gap-2 opacity-0 transition-opacity group-hover/result:opacity-100">
                          <a
                            href={image.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-surface-dark/80 text-gray-200 transition-colors hover:border-primary hover:text-white"
                            title="Open"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                          <a
                            href={downloadUrl}
                            download
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-surface-dark/80 text-gray-200 transition-colors hover:border-primary hover:text-white"
                            title="Download"
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
                    Canvas Empty
                  </h3>
                  <p className="mt-1 text-sm font-mono text-gray-600">
                    Configure your prompt below to start generating
                  </p>
                </div>
              )}

              {isGenerating && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
                  <div className="relative flex h-20 w-20 items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-4 border-white/10" />
                    <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <span className="text-sm font-bold text-white">
                      {progressValue}%
                    </span>
                  </div>
                  <p className="text-xs font-mono uppercase tracking-widest text-gray-300">
                    Generating...
                  </p>
                </div>
              )}

              {state.status === "failed" && !isGenerating && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/60 px-6 text-center">
                  <p className="text-sm font-bold text-red-300">
                    생성에 실패했습니다
                  </p>
                  <p className="text-xs font-mono text-gray-400">
                    {state.errorMessage ?? "잠시 후 다시 시도해주세요."}
                  </p>
                </div>
              )}
            </div>

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
                      <div className="group relative">
                        <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-primary/30 to-accent-purple/30 opacity-20 blur transition duration-500 group-focus-within:opacity-100" />
                        <div className="relative rounded-xl border border-white/10 bg-surface-dark transition-colors focus-within:border-primary/50">
                          <FormControl>
                            <Textarea
                              placeholder="Describe your imagination in detail..."
                              className="min-h-[120px] border-none bg-transparent px-4 py-4 text-white placeholder:text-gray-600 focus-visible:ring-0"
                              {...field}
                            />
                          </FormControl>
                          {initImagePreviews.length > 0 && (
                            <div className="flex flex-wrap gap-2 px-4 pb-3">
                              {initImagePreviews.map((item) => (
                                <div
                                  key={item.id}
                                  className="group relative h-14 w-14 overflow-hidden rounded-lg border border-white/10 bg-black/40"
                                >
                                  <img
                                    src={item.url}
                                    alt="Init image preview"
                                    className="h-full w-full object-cover"
                                  />
                                  <Button
                                    type="button"
                                    onClick={() => handleRemoveInitImage(item.id)}
                                    variant="ghost"
                                    size="icon-sm"
                                    className="absolute right-1 top-1 h-5 w-5 rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
                                    title="Remove"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center justify-between border-t border-white/5 px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={handleOpenImagePicker}
                                disabled={!canUploadImages || initImagePreviews.length >= maxInputImages}
                                className="text-gray-500 hover:bg-white/5 hover:text-white"
                                title={
                                  canUploadImages
                                    ? "Upload Reference Image"
                                    : "이미지 입력을 지원하지 않는 모델입니다."
                                }
                              >
                                <ImagePlus className="h-5 w-5" />
                              </Button>
                            </div>
                            <span className="text-[10px] font-mono text-gray-600">
                              {promptValue.length} / 1000 CHARS
                            </span>
                          </div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple={maxInputImages > 1}
                            className="hidden"
                            onChange={handleImageSelection}
                          />
                        </div>
                      </div>
                      <FormMessage className="text-xs text-red-400" />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  variant="hero"
                  size="hero"
                  disabled={isGenerating}
                  className="flex-col"
                >
                  <Sparkles className="h-7 w-7" />
                  {isGenerating ? "Generating" : "Generate"}
                </Button>
              </div>

            </div>
          </div>

          <aside className="flex w-full shrink-0 flex-col gap-6 rounded-2xl border border-white/10 bg-background-dark px-6 py-6 shadow-2xl xl:w-[400px] xl:rounded-none xl:border-l xl:border-white/10 xl:bg-transparent xl:shadow-none">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-xl font-black uppercase tracking-tight text-white">
                <span className="h-6 w-1.5 rounded-full bg-primary" />
                Settings
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  form.reset(imageGenerationDefaults);
                  setInitImagePreviews([]);
                  reset();
                }}
                className="text-gray-500 hover:bg-white/5 hover:text-white"
              >
                <RotateCcw className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex flex-col gap-8">
              {showSizeControls && (
                <div className="flex flex-col gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                    Output_Size
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    {widthConfig?.ui !== "hidden" && (
                      <FormField
                        control={form.control}
                        name="width"
                        render={({ field }) => (
                          <FormItem className="flex flex-col gap-2">
                            <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                              Width
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
                              Height
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
                      Range: {widthRange.min} ~ {widthRange.max}px
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
                            Steps
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
                          Seed
                        </FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input
                              className="h-10 flex-1 border-white/10 bg-surface-lighter font-mono text-sm text-white placeholder:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                              placeholder="-1 (Random)"
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
          </aside>
        </div>
      </form>
    </Form>
  );
}
