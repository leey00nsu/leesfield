import { VideoGenerationForm } from "@/features/video-generation/ui/video-generation-form";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export function VideoGenerationScreen() {
  return (
    <div className="flex flex-col gap-8 pb-20 overflow-x-hidden">
      <PageHeader
        title={
          <>
            <span className="text-white">Video</span>{" "}
            <span className="text-primary">Generation</span>
          </>
        }
        subtitle="MAKE VIDEOS IN ONE CLICK"
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="surface"
              disabled
              aria-disabled="true"
              className="h-9 gap-2 rounded-lg px-4 text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white disabled:hover:bg-surface-dark disabled:hover:text-gray-400"
              title="준비 중"
            >
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
              Clear
            </Button>
          </div>
        }
        rightSlotClassName="w-full md:w-auto"
      />

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8">
        <VideoGenerationForm />
      </div>
    </div>
  );
}
