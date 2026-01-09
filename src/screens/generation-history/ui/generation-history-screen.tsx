import {
  Grid2X2,
  Image as ImageIcon,
  Search,
  SlidersHorizontal,
  Video,
} from "lucide-react";

const placeholderCards = Array.from({ length: 8 });

export function GenerationHistoryScreen() {
  return (
    <div className="flex flex-col gap-8 pb-20">
      <div className="sticky top-0 z-20 -mx-6 -mt-6 border-b border-white/5 bg-background-dark/95 px-6 py-6 backdrop-blur-xl sm:px-10">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-black uppercase leading-tight tracking-[-0.033em] text-white sm:text-5xl">
                <span className="text-white">Generation</span>{" "}
                <span className="text-primary">History</span>
              </h1>
              <p className="mt-2 flex items-center gap-2 text-xs font-mono tracking-wide text-gray-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                ALL SYSTEMS OPERATIONAL // ARCHIVE ACCESS
              </p>
            </div>
            <div className="w-full md:w-96">
              <div className="group relative flex h-12 w-full items-center overflow-hidden rounded-xl border border-white/10 bg-surface-dark shadow-inner transition-all focus-within:border-primary">
                <div className="flex items-center justify-center pl-4 text-gray-500">
                  <Search className="h-5 w-5" />
                </div>
                <input
                  type="text"
                  placeholder="SEARCH_DATABASE..."
                  className="w-full border-none bg-transparent px-3 text-sm font-mono text-white placeholder:text-gray-600 focus:outline-none focus:ring-0"
                />
                <div className="pr-2">
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-primary"
                    aria-label="필터 옵션"
                  >
                    <SlidersHorizontal className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold uppercase tracking-wider text-black transition-colors hover:bg-primary-dark"
            >
              <Grid2X2 className="h-4 w-4" />
              All
            </button>
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-lg border border-white/5 bg-surface-dark px-4 text-xs font-bold uppercase tracking-wider text-gray-400 transition-all hover:bg-surface-lighter hover:text-white"
            >
              <ImageIcon className="h-4 w-4" />
              Images
            </button>
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-lg border border-white/5 bg-surface-dark px-4 text-xs font-bold uppercase tracking-wider text-gray-400 transition-all hover:bg-surface-lighter hover:text-white"
            >
              <Video className="h-4 w-4" />
              Videos
            </button>
            <div className="mx-2 h-6 w-px bg-white/10" />
            <button
              type="button"
              className="flex h-9 items-center gap-2 px-2 text-xs font-bold uppercase tracking-wider text-gray-500 transition-colors hover:text-primary"
            >
              <SlidersHorizontal className="h-4 w-4" />
              SORT: DATE_DESC
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1600px]">
        <div className="columns-1 gap-6 sm:columns-2 xl:columns-3">
          {placeholderCards.map((_, index) => (
            <div
              key={`history-placeholder-${index}`}
              className="mb-6 break-inside-avoid rounded-xl border border-white/5 bg-surface-dark shadow-lg transition-all hover:border-primary/50"
            >
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-t-xl bg-black">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent" />
              </div>
              <div className="flex flex-col gap-3 border-t border-white/5 bg-surface-dark p-4">
                <div className="h-4 w-3/4 rounded-full bg-white/10" />
                <div className="flex items-center justify-between border-t border-white/5 pt-3">
                  <div className="h-4 w-24 rounded-full bg-primary/20" />
                  <div className="h-3 w-12 rounded-full bg-white/10" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
