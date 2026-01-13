import { FolderOpen, Trash2 } from "lucide-react";
import { ImageGenerationForm } from "@/features/image-generation/ui/image-generation-form";
import { Button } from "@/shared/ui/button";
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
            <Button
              type="button"
              variant="surface"
              disabled
              aria-disabled="true"
              className="h-9 gap-2 rounded-lg px-4 text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white disabled:hover:bg-surface-dark disabled:hover:text-gray-400"
              title="준비 중"
            >
              <FolderOpen className="h-4 w-4" />
              Load Preset
            </Button>
            <Button
              type="button"
              variant="surface"
              disabled
              aria-disabled="true"
              className="h-9 gap-2 rounded-lg px-4 text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white disabled:hover:bg-surface-dark disabled:hover:text-gray-400"
              title="준비 중"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
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
