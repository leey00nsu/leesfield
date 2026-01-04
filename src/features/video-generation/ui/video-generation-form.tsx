import { zodResolver } from "@hookform/resolvers/zod";
import { Image as ImageIcon, Loader2, Video } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import {
  videoGenerationDefaults,
  videoGenerationSchema,
  type VideoGenerationFormValues,
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

export function VideoGenerationForm() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { state, startGeneration, reset } = useVideoGeneration();
  const isGenerating =
    state.status === "pending" || state.status === "processing";

  const form = useForm<VideoGenerationFormValues>({
    resolver: zodResolver(videoGenerationSchema),
    defaultValues: videoGenerationDefaults,
  });

  const mode = form.watch("mode");
  const promptValue = form.watch("prompt") ?? "";
  const initImageValue = form.watch("initImage") ?? "";

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (mode === "text" && initImageValue) {
      form.setValue("initImage", "");
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }, [mode, initImageValue, form, previewUrl]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(result);
      form.setValue("initImage", result, { shouldValidate: true });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    form.setValue("initImage", "", { shouldValidate: true });
    if (inputRef.current) inputRef.current.value = "";
  };

  const onSubmit = form.handleSubmit((values) => {
    startGeneration(values);
  });

  const handleReset = () => {
    form.reset(videoGenerationDefaults);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    reset();
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-surface-dark/80 p-8 shadow-[0_0_40px_rgba(0,0,0,0.35)]">
      <Form {...form}>
        <form className="flex flex-col gap-6" onSubmit={onSubmit}>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => form.setValue("mode", "text")}
              className={`flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-bold uppercase tracking-wider transition-all ${
                mode === "text"
                  ? "bg-primary text-black"
                  : "border border-white/5 bg-surface-dark text-gray-400 hover:bg-surface-lighter hover:text-white"
              }`}
            >
              <Video className="h-4 w-4" />
              Text to Video
            </button>
            <button
              type="button"
              onClick={() => form.setValue("mode", "image")}
              className={`flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-bold uppercase tracking-wider transition-all ${
                mode === "image"
                  ? "bg-primary text-black"
                  : "border border-white/5 bg-surface-dark text-gray-400 hover:bg-surface-lighter hover:text-white"
              }`}
            >
              <ImageIcon className="h-4 w-4" />
              Image to Video
            </button>
            <div className="h-6 w-px bg-white/10" />
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-gray-500">
              Turbo mode: off
            </span>
          </div>

          <FormField
            control={form.control}
            name="prompt"
            render={({ field }) => (
              <FormItem className="rounded-2xl border border-white/10 bg-surface-dark p-4">
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="Describe the video you want to generate in detail..."
                    className="min-h-[160px] border-0 bg-transparent px-0 py-0 text-sm text-white shadow-none focus-visible:ring-0"
                  />
                </FormControl>
                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-gray-500">
                  <span className="font-mono uppercase tracking-[0.2em]">
                    {mode === "text" ? "TEXT TO VIDEO" : "IMAGE TO VIDEO"}
                  </span>
                  <span className="font-mono">
                    {promptValue.length}/500
                  </span>
                </div>
                <FormMessage className="mt-2 text-xs text-red-400" />
              </FormItem>
            )}
          />

          {mode === "image" ? (
            <FormField
              control={form.control}
              name="initImage"
              render={() => (
                <FormItem>
                  <div className="rounded-2xl border border-dashed border-white/15 bg-surface-lighter/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3 text-sm text-gray-300">
                        <ImageIcon className="h-5 w-5 text-primary" />
                        <span>참조 이미지를 업로드하세요 (1장)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="rounded-full border border-white/10 bg-surface-dark px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-all hover:border-primary/50 hover:bg-white/5"
                      >
                        이미지 선택
                      </button>
                      <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </div>
                    {previewUrl ? (
                      <div className="mt-4 flex items-center gap-4 rounded-xl border border-white/10 bg-background-dark/40 p-3">
                        <img
                          src={previewUrl}
                          alt="Uploaded preview"
                          className="h-20 w-20 rounded-lg object-cover"
                        />
                        <div className="flex flex-col gap-2 text-sm text-gray-300">
                          <span>업로드한 이미지</span>
                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white"
                          >
                            제거
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <FormMessage className="mt-2 text-xs text-red-400" />
                </FormItem>
              )}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={isGenerating}
              className="h-11 gap-2 rounded-full bg-primary px-5 text-sm font-bold uppercase tracking-wider text-primary-content shadow-[0_4px_20px_rgba(212,240,50,0.15)] transition-all hover:bg-primary"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating
                </>
              ) : (
                "Generate"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full border-white/10 bg-surface-lighter px-5 text-sm font-bold uppercase tracking-wider text-white hover:border-primary/50 hover:bg-white/5"
              onClick={handleReset}
              disabled={isGenerating}
            >
              Reset
            </Button>
          </div>

          {state.status !== "idle" ? (
            <div className="rounded-2xl border border-white/10 bg-background-dark/40 p-4 text-sm text-gray-300">
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-gray-500">
                <span>Status</span>
                <span>{state.status}</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${state.progress}%` }}
                />
              </div>
              {state.errorMessage ? (
                <p className="mt-3 text-xs text-red-400">
                  {state.errorMessage}
                </p>
              ) : null}
              {state.status === "completed" &&
              (state.result?.videos?.length ?? 0) === 0 ? (
                <p className="mt-3 text-xs text-gray-400">
                  생성이 완료되었습니다. 결과는 다음 단계에서 표시됩니다.
                </p>
              ) : null}
            </div>
          ) : null}
        </form>
      </Form>
    </section>
  );
}
