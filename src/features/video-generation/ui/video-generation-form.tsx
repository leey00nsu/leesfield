"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Download,
  ExternalLink,
  Grid2x2,
  ImagePlus,
  Maximize2,
  RotateCcw,
  Sparkles,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  videoGenerationDefaults,
  videoGenerationSchema,
  videoModelMeta,
  type VideoGenerationFormValues,
  type VideoGenerationModel,
} from "@/features/video-generation/model/video-generation-schema";
import {
  getVideoParamConfig,
  getVideoParamRange,
  videoModels,
} from "@/features/video-generation/model/video-models";
import { useVideoGeneration } from "@/features/video-generation/hook/use-video-generation";
import { Button } from "@/shared/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/shared/ui/form";
import { Textarea } from "@/shared/ui/textarea";
import { cn } from "@/shared/lib/utils";

const modelCards = videoModels.map((model, index) => ({
  id: model.key as VideoGenerationModel,
  name: model.label,
  vendor: model.vendor,
  active: index === 0,
})) as ReadonlyArray<{
  id: VideoGenerationModel;
  name: string;
  vendor: string;
  active: boolean;
}>;

export function VideoGenerationForm() {
  const searchParams = useSearchParams();
  const form = useForm<VideoGenerationFormValues>({
    resolver: zodResolver(videoGenerationSchema),
    defaultValues: videoGenerationDefaults,
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
  const durationSec =
    form.watch("durationSec") ?? videoGenerationDefaults.durationSec;
  const activeModel =
    form.watch("model") ?? videoGenerationDefaults.model;
  const durationRange = getVideoParamRange(activeModel, "durationSec");
  const durationConfig = getVideoParamConfig(activeModel, "durationSec");
  const aspectRatioConfig = getVideoParamConfig(activeModel, "aspectRatio");
  const resolutionConfig = getVideoParamConfig(activeModel, "resolution");
  const showDuration = durationConfig?.ui !== "hidden";
  const showSizeNotice =
    aspectRatioConfig?.ui === "hidden" && resolutionConfig?.ui === "hidden";
  const initImageValue = form.watch("initImage") ?? "";
  const supportsInitImage =
    videoModelMeta[activeModel]?.supportsInitImage ?? false;
  const hasInitImage = Boolean(initImageValue);
  const canSubmit =
    promptValue.trim().length > 0 && (!supportsInitImage || hasInitImage);

  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initImageValue || null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { state, startGeneration, reset } = useVideoGeneration();
  const isGenerating =
    state.status === "pending" || state.status === "processing";
  const progressValue = Math.min(100, Math.max(0, Math.round(state.progress)));
  const resultVideos = state.result?.videos ?? [];
  const hasResults = state.status === "completed" && resultVideos.length > 0;
  const primaryVideo = resultVideos[0];

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
      setPreviewUrl(result);
      form.setValue("initImage", result, { shouldValidate: true });
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveInitImage = () => {
    setPreviewUrl(null);
    form.setValue("initImage", "", { shouldValidate: true });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleReset = () => {
    form.reset(videoGenerationDefaults);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    reset();
  };

  const handleGenerate = (values: VideoGenerationFormValues) => {
    startGeneration(values);
  };

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-8"
        onSubmit={form.handleSubmit(handleGenerate)}
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
            {modelCards.map((model) => (
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
                  disabled
                  aria-disabled="true"
                  variant="surface"
                  size="icon"
                  className="border-white/10 bg-surface-dark/80 text-gray-400 hover:border-white/30 hover:text-white"
                  title="Grid (disabled)"
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
                  title="Full Screen (disabled)"
                >
                  <Maximize2 className="h-5 w-5" />
                </Button>
              </div>

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

            {hasResults && primaryVideo ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
                  READY • {primaryVideo.width ?? "--"}x
                  {primaryVideo.height ?? "--"}
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={primaryVideo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-surface-dark/80 text-gray-200 transition-colors hover:border-primary hover:text-white"
                    title="Open"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <a
                    href={primaryVideo.url}
                    download
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-surface-dark/80 text-gray-200 transition-colors hover:border-primary hover:text-white"
                    title="Download"
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
                      <div className="group relative">
                        <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-primary/30 to-accent-purple/30 opacity-20 blur transition duration-500 group-focus-within:opacity-100" />
                        <div className="relative rounded-xl border border-white/10 bg-surface-dark transition-colors focus-within:border-primary/50">
                          <FormControl>
                            <Textarea
                              placeholder="Describe the video you want to generate in detail..."
                              className="min-h-[120px] border-none bg-transparent px-4 py-4 text-white placeholder:text-gray-600 focus-visible:ring-0"
                              {...field}
                            />
                          </FormControl>
                          {previewUrl ? (
                            <div className="flex flex-wrap gap-2 px-4 pb-3">
                              <div className="group relative h-14 w-14 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                                <img
                                  src={previewUrl}
                                  alt="Init image preview"
                                  className="h-full w-full object-cover"
                                />
                                <Button
                                  type="button"
                                  onClick={handleRemoveInitImage}
                                  variant="ghost"
                                  size="icon-sm"
                                  className="absolute right-1 top-1 h-5 w-5 rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
                                  title="Remove"
                                >
                                  <span className="text-xs">×</span>
                                </Button>
                              </div>
                            </div>
                          ) : null}
                          <div className="flex items-center justify-between border-t border-white/5 px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={handleOpenImagePicker}
                                aria-label="Upload Reference Image"
                                disabled={!supportsInitImage}
                                className={cn(
                                  "transition-colors",
                                  supportsInitImage
                                    ? "text-gray-500 hover:bg-white/5 hover:text-white"
                                    : "cursor-not-allowed text-gray-700"
                                )}
                                title="Upload Reference Image"
                              >
                                <ImagePlus className="h-5 w-5" />
                              </Button>
                              <span className="text-[10px] font-mono text-gray-600">
                                {supportsInitImage
                                  ? hasInitImage
                                    ? "IMAGE TO VIDEO"
                                    : "IMAGE REQUIRED"
                                  : "TEXT ONLY"}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-gray-600">
                              {promptValue.length} CHARS
                            </span>
                          </div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
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
                  disabled={isGenerating || !canSubmit}
                  className="flex h-[120px] flex-col items-center justify-center gap-2 rounded-xl bg-primary text-sm font-black uppercase tracking-wider text-primary-content shadow-[0_0_30px_rgba(212,240,50,0.2)] transition-all hover:scale-[1.02] hover:shadow-[0_0_50px_rgba(212,240,50,0.4)] active:scale-[0.98] lg:px-8"
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
                onClick={handleReset}
                className="text-gray-500 hover:bg-white/5 hover:text-white"
              >
                <RotateCcw className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex flex-col gap-8">
              {showSizeNotice && (
                <div className="flex flex-col gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                    Output_Size
                  </span>
                  <div className="rounded-xl border border-white/10 bg-surface-lighter px-4 py-3 text-xs text-gray-400">
                    이 스페이스는 해상도/비율 변경을 지원하지 않습니다.{" "}
                    <span className="text-white">
                      이미지 입력이 있으면 그 비율을 참고
                    </span>
                    하며, 텍스트 전용은 기본 해상도로 생성됩니다.
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
                          Duration_Sec
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
          </aside>
        </div>
      </form>
    </Form>
  );
}
