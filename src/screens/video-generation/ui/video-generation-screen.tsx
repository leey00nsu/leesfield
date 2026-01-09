import { VideoGenerationForm } from "@/features/video-generation/ui/video-generation-form";

export function VideoGenerationScreen() {
  return (
    <div className="flex flex-col gap-8 pb-20">
      <div className="sticky top-0 z-20 -mx-6 -mt-6 border-b border-white/5 bg-background-dark/95 px-6 py-6 backdrop-blur-xl sm:px-10">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-black uppercase leading-tight tracking-[-0.033em] text-white sm:text-5xl">
                <span className="text-white">Video</span>{" "}
                <span className="text-primary">Generation</span>
              </h1>
              <p className="mt-2 flex items-center gap-2 text-xs font-mono tracking-wide text-gray-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                MAKE VIDEOS IN ONE CLICK
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-surface-dark px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-400 transition-all hover:bg-surface-lighter hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-dark disabled:hover:text-gray-400"
                title="준비 중"
              >
                Load Preset
              </button>
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-surface-dark px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-400 transition-all hover:bg-surface-lighter hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-dark disabled:hover:text-gray-400"
                title="준비 중"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8">
        <VideoGenerationForm />
      </div>
    </div>
  );
}
