"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Ban,
  Dice5,
  ImagePlus,
  Image as ImageIcon,
  Maximize2,
  Grid2x2,
  RotateCcw,
  Sparkles,
  Download,
  ExternalLink,
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
  aspectRatioMeta,
  aspectRatioOptions,
  imageGenerationDefaults,
  imageGenerationSchema,
  samplerOptions,
  type ImageGenerationFormValues,
} from "@/features/image-generation/model/image-generation-schema";
import { useImageGeneration } from "@/features/image-generation/hook/use-image-generation";

const modelOptions = [
  {
    id: "z-image-turbo",
    name: "Z-Image Turbo",
    vendor: "MODAL",
    active: true,
  },
  { id: "sdxl-1", name: "SDXL 1.0", vendor: "STABILITY", active: false },
  {
    id: "realistic-vision",
    name: "Realistic Vision V6",
    vendor: "CIVITAI",
    active: false,
  },
];

export function ImageGenerationForm() {
  const form = useForm<ImageGenerationFormValues>({
    resolver: zodResolver(imageGenerationSchema),
    defaultValues: imageGenerationDefaults,
    mode: "onChange",
  });

  const promptValue = form.watch("prompt") ?? "";
  const aspectRatio = form.watch("aspectRatio") ?? imageGenerationDefaults.aspectRatio;
  const imageCount = form.watch("imageCount") ?? imageGenerationDefaults.imageCount;
  const cfgScale = form.watch("cfgScale") ?? imageGenerationDefaults.cfgScale;
  const steps = form.watch("steps") ?? imageGenerationDefaults.steps;

  const aspectMeta = useMemo(
    () => aspectRatioMeta[aspectRatio],
    [aspectRatio],
  );

  const { state, startGeneration } = useImageGeneration();
  const isGenerating =
    state.status === "pending" || state.status === "processing";
  const progressValue = Math.min(100, Math.max(0, Math.round(state.progress)));
  const resultImages = state.result?.images ?? [];
  const hasResults = state.status === "completed" && resultImages.length > 0;
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
            <button
              type="button"
              className="text-primary text-xs font-bold uppercase hover:underline"
            >
              View All Models
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modelOptions.map((model) => (
              <button
                key={model.id}
                type="button"
                className={cn(
                  "group relative flex flex-col rounded-xl bg-surface-dark p-1 text-left transition-all",
                  model.active
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
                {model.active && (
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
                  className="rounded-lg border border-white/10 bg-surface-dark/80 p-2 text-gray-400 transition-colors hover:border-white/30 hover:text-white"
                  title="Toggle Grid"
                >
                  <Grid2x2 className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-surface-dark/80 p-2 text-gray-400 transition-colors hover:border-white/30 hover:text-white"
                  title="Full Screen"
                >
                  <Maximize2 className="h-5 w-5" />
                </button>
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
                          <div className="flex items-center justify-between border-t border-white/5 px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
                                title="Add Negative Prompt"
                              >
                                <Ban className="h-5 w-5" />
                              </button>
                              <button
                                type="button"
                                className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
                                title="Upload Reference Image"
                              >
                                <ImagePlus className="h-5 w-5" />
                              </button>
                              <button
                                type="button"
                                className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-primary"
                                title="Randomize Prompt"
                              >
                                <Dice5 className="h-5 w-5" />
                              </button>
                            </div>
                            <span className="text-[10px] font-mono text-gray-600">
                              {promptValue.length} / 1000 CHARS
                            </span>
                          </div>
                        </div>
                      </div>
                      <FormMessage className="text-xs text-red-400" />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={isGenerating}
                  className="flex h-[120px] flex-col items-center justify-center gap-2 rounded-xl bg-primary text-sm font-black uppercase tracking-wider text-primary-content shadow-[0_0_30px_rgba(212,240,50,0.2)] transition-all hover:scale-[1.02] hover:shadow-[0_0_50px_rgba(212,240,50,0.4)] active:scale-[0.98] lg:px-8"
                >
                  <Sparkles className="h-7 w-7" />
                  {isGenerating ? "Generating" : "Generate"}
                </Button>
              </div>

              <FormField
                control={form.control}
                name="negativePrompt"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-4 px-2">
                    <FormLabel className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-widest text-red-500 font-mono">
                      Negative_Prompt
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="ugly, deformed, blurry, low quality..."
                        className="h-10 border-white/5 bg-surface-lighter/50 text-sm text-gray-400 transition-colors focus:text-white focus-visible:border-red-500/50 focus-visible:ring-0"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-xs text-red-400" />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <aside className="hidden w-[400px] shrink-0 flex-col gap-6 border-l border-white/10 bg-background-dark px-6 py-6 shadow-2xl xl:flex">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-xl font-black uppercase tracking-tight text-white">
                <span className="h-6 w-1.5 rounded-full bg-primary" />
                Settings
              </h3>
              <button
                type="button"
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
                    <div className="grid grid-cols-4 gap-2">
                      {aspectRatioOptions.map((ratio) => {
                        const isActive = field.value === ratio;
                        const boxClass =
                          ratio === "1:1"
                            ? "h-4 w-4"
                            : ratio === "4:3"
                              ? "h-3 w-4"
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
                    Height: <span className="text-white">{aspectMeta.height}</span>
                  </span>
                </div>
              </div>

              <div className="h-px bg-white/5" />

              <div className="flex flex-col gap-6">
                <FormField
                  control={form.control}
                  name="imageCount"
                  render={({ field }) => (
                    <FormItem className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                          Image_Count
                        </FormLabel>
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary font-mono">
                          {imageCount}
                        </span>
                      </div>
                      <FormControl>
                        <input
                          type="range"
                          min={1}
                          max={8}
                          step={1}
                          value={field.value}
                          onChange={(event) =>
                            field.onChange(Number(event.target.value))
                          }
                          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface-lighter"
                        />
                      </FormControl>
                      <div className="flex justify-between px-1 text-[10px] font-mono text-gray-600">
                        <span>1</span>
                        <span>8</span>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cfgScale"
                  render={({ field }) => (
                    <FormItem className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                          CFG_Scale
                        </FormLabel>
                        <span className="rounded border border-white/10 bg-surface-lighter px-2 py-0.5 text-xs font-bold text-white font-mono">
                          {cfgScale.toFixed(1)}
                        </span>
                      </div>
                      <FormControl>
                        <input
                          type="range"
                          min={1}
                          max={20}
                          step={0.5}
                          value={field.value}
                          onChange={(event) =>
                            field.onChange(Number(event.target.value))
                          }
                          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface-lighter"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

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
                          min={10}
                          max={150}
                          step={1}
                          value={field.value}
                          onChange={(event) =>
                            field.onChange(Number(event.target.value))
                          }
                          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface-lighter"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="h-px bg-white/5" />

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
                            className="h-10 flex-1 border-white/10 bg-surface-lighter font-mono text-sm text-white placeholder:text-gray-600"
                            placeholder="-1 (Random)"
                            {...field}
                          />
                          <button
                            type="button"
                            className="rounded-lg border border-white/10 bg-surface-lighter p-2 transition-colors hover:border-primary hover:text-primary"
                          >
                            <Dice5 className="h-4 w-4" />
                          </button>
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sampler"
                  render={({ field }) => (
                    <FormItem className="flex flex-col gap-2">
                      <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">
                        Sampler
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <select
                            className="h-10 w-full appearance-none rounded-lg border border-white/10 bg-surface-lighter px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                            value={field.value}
                            onChange={field.onChange}
                          >
                            {samplerOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-gray-400">
                            ▾
                          </span>
                        </div>
                      </FormControl>
                    </FormItem>
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
