import { Image as ImageIcon, Video } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

type GenerationMode = "text" | "image";

export function VideoGenerationForm() {
  const [mode, setMode] = useState<GenerationMode>("text");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-surface-dark/80 p-8 shadow-[0_0_40px_rgba(0,0,0,0.35)]">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setMode("text")}
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
            onClick={() => setMode("image")}
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

        <div className="rounded-2xl border border-white/10 bg-surface-dark p-4">
          <textarea
            placeholder="Describe the video you want to generate in detail..."
            className="h-40 w-full resize-none bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none"
          />
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-gray-500">
            <span className="font-mono uppercase tracking-[0.2em]">
              {mode === "text" ? "TEXT TO VIDEO" : "IMAGE TO VIDEO"}
            </span>
            <span className="font-mono">0/500</span>
          </div>
        </div>

        {mode === "image" ? (
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
        ) : null}
      </div>
    </section>
  );
}
