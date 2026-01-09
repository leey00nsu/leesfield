import {
  Grid2X2,
  Image as ImageIcon,
  Search,
  SlidersHorizontal,
  Video,
} from "lucide-react";
import type { GenerationHistoryItem } from "@/entities/generation/model/types";
import { HistoryList } from "@/features/generation-history/ui/history-list";

const now = Date.now();
const mockItems: GenerationHistoryItem[] = [
  {
    id: "img-001",
    type: "image",
    status: "completed",
    prompt: "A neon-lit alleyway in the rain, cinematic lighting, ultra-detailed.",
    model: "Z-Image-Turbo",
    createdAt: new Date(now - 1000 * 60 * 12).toISOString(),
    resultUrl: "/sample-image.png",
    thumbnailUrl: "/sample-image.png",
    errorMessage: null,
  },
  {
    id: "img-002",
    type: "image",
    status: "processing",
    prompt: "Portrait of a hacker with holographic UI overlays, moody lighting.",
    model: "Z-Image-Turbo",
    createdAt: new Date(now - 1000 * 60 * 30).toISOString(),
    resultUrl: null,
    thumbnailUrl: null,
    errorMessage: null,
  },
  {
    id: "img-003",
    type: "image",
    status: "failed",
    prompt: "Midjourney-style surreal desert skyline with floating mirrors.",
    model: "Z-Image-Turbo",
    createdAt: new Date(now - 1000 * 60 * 60).toISOString(),
    resultUrl: null,
    thumbnailUrl: null,
    errorMessage: "이미지 생성에 실패했습니다.",
  },
  {
    id: "vid-001",
    type: "video",
    status: "completed",
    prompt: "Slow drone shot over a cyberpunk megacity, dusk, volumetric fog.",
    model: "HunyuanVideo-1.5",
    createdAt: new Date(now - 1000 * 60 * 90).toISOString(),
    resultUrl: "/sample-video.mp4",
    thumbnailUrl: null,
    errorMessage: null,
  },
  {
    id: "vid-002",
    type: "video",
    status: "pending",
    prompt: "A futuristic train arriving at a neon station, cinematic wide shot.",
    model: "HunyuanVideo-1.5",
    createdAt: new Date(now - 1000 * 60 * 150).toISOString(),
    resultUrl: null,
    thumbnailUrl: null,
    errorMessage: null,
  },
  {
    id: "vid-003",
    type: "video",
    status: "failed",
    prompt: "Underwater bioluminescent forest, glowing jellyfish drifting.",
    model: "HunyuanVideo-1.5",
    createdAt: new Date(now - 1000 * 60 * 240).toISOString(),
    resultUrl: null,
    thumbnailUrl: null,
    errorMessage: "비디오 생성 시간이 초과되었습니다.",
  },
];

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
        <HistoryList items={mockItems} />
      </div>
    </div>
  );
}
