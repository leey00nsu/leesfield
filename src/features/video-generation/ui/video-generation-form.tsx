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
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import {
  resolveVideoAspectRatioSize,
  videoAspectRatioOptions,
  videoDurationOptions,
  videoFpsOptions,
  videoGenerationDefaults,
  videoGenerationSchema,
  videoModelMeta,
  videoResolutionOptions,
  type VideoGenerationFormValues,
  type VideoGenerationModel,
} from "@/features/video-generation/model/video-generation-schema";
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

const modelCards = [
  {
    id: "hunyuanvideo-1.5",
    name: "HunyuanVideo 1.5",
    vendor: "HUNYUAN",
    active: true,
  },
] as const satisfies ReadonlyArray<{
  id: VideoGenerationModel;
  name: string;
  vendor: string;
  active: boolean;
}>;

export function VideoGenerationForm() {
  const form = useForm<VideoGenerationFormValues>({
    resolver: zodResolver(videoGenerationSchema),
    defaultValues: videoGenerationDefaults,
    mode: "onChange",
  });

  const promptValue = form.watch("prompt") ?? "";
  const aspectRatio =
    form.watch("aspectRatio") ?? videoGenerationDefaults.aspectRatio;
  const resolution =
    form.watch("resolution") ?? videoGenerationDefaults.resolution;
  const durationSec =
    form.watch("durationSec") ?? videoGenerationDefaults.durationSec;
  const fps = form.watch("fps") ?? videoGenerationDefaults.fps;
  const activeModel =
    form.watch("model") ?? videoGenerationDefaults.model;
  const initImageValue = form.watch("initImage") ?? "";
  const supportsInitImage =
    videoModelMeta[activeModel]?.supportsInitImage ?? false;
  const hasInitImage = Boolean(initImageValue);
  const canSubmit = promptValue.trim().length > 0;

  const aspectMeta = useMemo(
    () => resolveVideoAspectRatioSize(aspectRatio, resolution),
    [aspectRatio, resolution],
  );

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
            <button
              type="button"
              className="text-primary text-xs font-bold uppercase hover:underline"
            >
              View All Models
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modelCards.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => form.setValue("model", model.id)}
                className={cn(
                  "group relative flex flex-col rounded-xl bg-surface-dark p-1 text-left transition-all",
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
              </button>
            ))}
          </div>
        </section>

        <div className="flex flex-col gap-8 xl:flex-row">
          <div className="flex flex-1 flex-col gap-6">
            <div className="group relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-white/10 bg-black/40">
              <div className="absolute inset-0 bg-[radial-gradient(circle,_#333_1px,_transparent_1px)] opacity-20" />
              <div className="absolute right-4 top-4 flex gap-2">
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="rounded-lg border border-white/10 bg-surface-dark/80 p-2 text-gray-400 transition-colors hover:border-white/30 hover:text-white"
                  title="Grid (disabled)"
                >
                  <Grid2x2 className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="rounded-lg border border-white/10 bg-surface-dark/80 p-2 text-gray-400 transition-colors hover:border-white/30 hover:text-white"
                  title="Full Screen (disabled)"
                >
                  <Maximize2 className="h-5 w-5" />
                </button>
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
                                <button
                                  type="button"
                                  onClick={handleRemoveInitImage}
                                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                  title="Remove"
                                >
                                  <span className="text-xs">×</span>
                                </button>
                              </div>
                            </div>
                          ) : null}
                          <div className="flex items-center justify-between border-t border-white/5 px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={handleOpenImagePicker}
                                aria-label="Upload Reference Image"
                                disabled={!supportsInitImage}
                                className={cn(
                                  "rounded-md p-1.5 transition-colors",
                                  supportsInitImage
                                    ? "text-gray-500 hover:bg-white/5 hover:text-white"
                                    : "cursor-not-allowed text-gray-700"
                                )}
                                title="Upload Reference Image"
                              >
                                <ImagePlus className="h-5 w-5" />
                              </button>
                              <span className="text-[10px] font-mono text-gray-600">
                                {!supportsInitImage
                                  ? "TEXT ONLY"
                                  : hasInitImage
                                    ? "IMAGE TO VIDEO"
                                    : "TEXT TO VIDEO"}
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
              <button
                type="button"
                onClick={handleReset}
                className="text-gray-500 transition-colors hover:text-white"
              >
                <RotateCcw className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                  Aspect_Ratio
                </span>
                <FormField
                  control={form.control}
                  name="aspectRatio"
                  render={({ field }) => (
                    <div className="grid grid-cols-3 gap-2">
                      {videoAspectRatioOptions.map((ratio) => {
                        const isActive = field.value === ratio;
                        const boxClass =
                          ratio === "1:1"
                            ? "h-4 w-4"
                            : ratio === "16:9"
                              ? "h-3 w-5"
                              : "h-5 w-3";

                        return (
                          <button
                            key={ratio}
                            type="button"
                            onClick={() => field.onChange(ratio)}
                            className={cn(
                              "flex flex-col items-center justify-center gap-1 rounded-lg border px-3 py-3 text-[10px] font-bold transition-all",
                              isActive
                                ? "border-primary bg-primary/10 text-white"
                                : "border-white/10 bg-surface-lighter text-gray-400 hover:bg-white/5 hover:text-white",
                            )}
                          >
                            <div
                              className={cn(
                                "rounded-sm border-2",
                                isActive ? "border-primary" : "border-current",
                                boxClass,
                              )}
                            />
                            {ratio}
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
                <div className="flex items-center justify-between px-1 text-xs text-gray-400">
                  <span>
                    Width: <span className="text-white">{aspectMeta.width}</span>
                  </span>
                  <span>
                    Height:{" "}
                    <span className="text-white">{aspectMeta.height}</span>
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                  Resolution
                </span>
                <FormField
                  control={form.control}
                  name="resolution"
                  render={({ field }) => (
                    <div className="grid grid-cols-2 gap-2">
                      {videoResolutionOptions.map((value) => {
                        const isActive = field.value === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => field.onChange(value)}
                            className={cn(
                              "rounded-lg border px-4 py-2 text-xs font-bold transition-all",
                              isActive
                                ? "border-primary bg-primary/10 text-white"
                                : "border-white/10 bg-surface-lighter text-gray-400 hover:bg-white/5 hover:text-white",
                            )}
                          >
                            {value}p
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
              </div>

              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                  Duration_Sec
                </span>
                <FormField
                  control={form.control}
                  name="durationSec"
                  render={({ field }) => (
                    <div className="grid grid-cols-4 gap-2">
                      {videoDurationOptions.map((value) => {
                        const isActive = field.value === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => field.onChange(value)}
                            className={cn(
                              "rounded-lg border px-3 py-2 text-xs font-bold transition-all",
                              isActive
                                ? "border-primary bg-primary/10 text-white"
                                : "border-white/10 bg-surface-lighter text-gray-400 hover:bg-white/5 hover:text-white",
                            )}
                          >
                            {value}s
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
              </div>

              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                  FPS
                </span>
                <FormField
                  control={form.control}
                  name="fps"
                  render={({ field }) => (
                    <div className="grid grid-cols-3 gap-2">
                      {videoFpsOptions.map((value) => {
                        const isActive = field.value === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => field.onChange(value)}
                            className={cn(
                              "rounded-lg border px-3 py-2 text-xs font-bold transition-all",
                              isActive
                                ? "border-primary bg-primary/10 text-white"
                                : "border-white/10 bg-surface-lighter text-gray-400 hover:bg-white/5 hover:text-white",
                            )}
                          >
                            {value} fps
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
              </div>
            </div>
          </aside>
        </div>
      </form>
    </Form>
  );
}
