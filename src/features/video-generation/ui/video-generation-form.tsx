"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Download,
  ExternalLink,
  Grid2x2,
  ImagePlus,
  Maximize2,
  Sparkles,
  Video,
} from "lucide-react";
import { useEffect, useRef, type ChangeEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
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
import { GenerationCanvas } from "@/shared/ui/generation-canvas";
import { GenerationModelSection } from "@/shared/ui/generation-model-section";
import { GenerationPromptField } from "@/shared/ui/generation-prompt-field";
import { GenerationSettingsPanel } from "@/shared/ui/generation-settings-panel";
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

  const promptValue = useWatch({ control: form.control, name: "prompt" }) ?? "";
  const durationSec =
    useWatch({ control: form.control, name: "durationSec" }) ??
    videoGenerationDefaults.durationSec;
  const activeModel =
    useWatch({ control: form.control, name: "model" }) ??
    videoGenerationDefaults.model;
  const durationRange = getVideoParamRange(activeModel, "durationSec");
  const durationConfig = getVideoParamConfig(activeModel, "durationSec");
  const aspectRatioConfig = getVideoParamConfig(activeModel, "aspectRatio");
  const resolutionConfig = getVideoParamConfig(activeModel, "resolution");
  const showDuration = durationConfig?.ui !== "hidden";
  const showSizeNotice =
    aspectRatioConfig?.ui === "hidden" && resolutionConfig?.ui === "hidden";
  const initImageValue =
    useWatch({ control: form.control, name: "initImage" }) ?? "";

  const supportsInitImage =
    videoModelMeta[activeModel]?.supportsInitImage ?? false;
  const hasInitImage = Boolean(initImageValue);
  const canSubmit =
    promptValue.trim().length > 0 && (!supportsInitImage || hasInitImage);

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
      form.setValue("initImage", result, { shouldValidate: true });
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveInitImage = () => {
    form.setValue("initImage", "", { shouldValidate: true });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleReset = () => {
    form.reset(videoGenerationDefaults);
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
        <GenerationModelSection
          items={modelCards}
          activeId={activeModel}
          onSelect={(modelId) => form.setValue("model", modelId)}
          action={
            <Button
              type="button"
              variant="link"
              disabled
              aria-disabled="true"
              className="h-auto p-0 text-xs font-bold uppercase text-primary hover:underline"
              title="준비 중"
            >
              View All Models
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
                </>
              }
              isGenerating={isGenerating}
              progressValue={progressValue}
              status={state.status}
              errorMessage={state.errorMessage}
            >
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
            </GenerationCanvas>

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
                      <GenerationPromptField
                        textarea={
                          <FormControl>
                            <Textarea
                              placeholder="Describe the video you want to generate in detail..."
                              className="min-h-[120px] border-none bg-transparent px-4 py-4 text-white placeholder:text-gray-600 focus-visible:ring-0"
                              {...field}
                            />
                          </FormControl>
                        }
                        attachments={
                          initImageValue ? (
                            <div className="flex flex-wrap gap-2 px-4 pb-3">
                              <div className="group relative h-14 w-14 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={initImageValue}
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
                          ) : null
                        }
                        footerLeft={
                          <>
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
                          </>
                        }
                        footerRight={
                          <span className="text-[10px] font-mono text-gray-600">
                            {promptValue.length} CHARS
                          </span>
                        }
                      />
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageSelection}
                      />
                      <FormMessage className="text-xs text-red-400" />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  variant="hero"
                  size="hero"
                  disabled={isGenerating || !canSubmit}
                  className="flex-col"
                >
                  <Sparkles className="h-7 w-7" />
                  {isGenerating ? "Generating" : "Generate"}
                </Button>
              </div>
            </div>
          </div>

          <GenerationSettingsPanel onReset={handleReset}>
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
          </GenerationSettingsPanel>
        </div>
      </form>
    </Form>
  );
}
