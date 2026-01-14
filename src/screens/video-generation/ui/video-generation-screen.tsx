import { VideoGenerationForm } from "@/features/video-generation/ui/video-generation-form";
import { GenerationHeaderActions } from "@/shared/ui/generation-header-actions";
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
          <GenerationHeaderActions
            actions={[
              { label: "Load Preset", disabled: true, title: "준비 중" },
              { label: "Clear", disabled: true, title: "준비 중" },
            ]}
          />
        }
        rightSlotClassName="w-full md:w-auto"
      />

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8">
        <VideoGenerationForm />
      </div>
    </div>
  );
}
