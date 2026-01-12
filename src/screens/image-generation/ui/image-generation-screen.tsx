import { FolderOpen, Trash2 } from "lucide-react";
import { ImageGenerationForm } from "@/features/image-generation/ui/image-generation-form";
import { PageHeader } from "@/shared/ui/page-header";

export function ImageGenerationScreen() {
  return (
    <div className="flex flex-col gap-8 pb-20 overflow-x-hidden">
      <PageHeader
        title={
          <>
            <span className="text-white">Image</span>{" "}
            <span className="text-primary">Generation</span>
          </>
        }
        subtitle="MAKE IMAGES IN ONE CLICK"
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            {/* TODO: 프리셋 로드/초기화 기능은 추후 구현 예정 */}
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-surface-dark px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-400 transition-all hover:bg-surface-lighter hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-dark disabled:hover:text-gray-400"
              title="준비 중"
            >
              <FolderOpen className="h-4 w-4" />
              Load Preset
            </button>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-surface-dark px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-400 transition-all hover:bg-surface-lighter hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-dark disabled:hover:text-gray-400"
              title="준비 중"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </button>
          </div>
        }
        rightSlotClassName="w-full md:w-auto"
      />

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8">
        <ImageGenerationForm />
      </div>
    </div>
  );
}
