import { VideoGenerationForm } from "@/features/video-generation/ui/video-generation-form";
import { GenerationHeaderActions } from "@/shared/ui/generation-header-actions";
import { PageHeader } from "@/shared/ui/page-header";
import { useTranslations } from "next-intl";

type VideoGenerationScreenProps = {
  isAuthenticated: boolean;
};

export function VideoGenerationScreen({
  isAuthenticated,
}: VideoGenerationScreenProps) {
  const tVideo = useTranslations("generation.video");
  const tCommonActions = useTranslations("common.actions");

  return (
    <div className="flex flex-col gap-8 pb-20 overflow-x-hidden">
      <PageHeader
        title={
          <>
            <span className="text-white">{tVideo("title.leading")}</span>{" "}
            <span className="text-primary">{tVideo("title.accent")}</span>
          </>
        }
        subtitle={tVideo("subtitle")}
        rightSlot={
          <GenerationHeaderActions
            actions={[
              {
                label: tCommonActions("loadPreset"),
                disabled: true,
                title: tCommonActions("comingSoon"),
              },
              {
                label: tCommonActions("clear"),
                disabled: true,
                title: tCommonActions("comingSoon"),
              },
            ]}
          />
        }
        rightSlotClassName="w-full md:w-auto"
      />

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8">
        <VideoGenerationForm isAuthenticated={isAuthenticated} />
      </div>
    </div>
  );
}
