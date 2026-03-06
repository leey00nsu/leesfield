import { FolderOpen, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { AudioGenerationForm } from "@/features/audio-generation/ui/audio-generation-form";
import { GenerationHeaderActions } from "@/shared/ui/generation-header-actions";
import { PageHeader } from "@/shared/ui/page-header";

type AudioGenerationScreenProps = {
  isAuthenticated: boolean;
};

export function AudioGenerationScreen({
  isAuthenticated,
}: AudioGenerationScreenProps) {
  const tAudio = useTranslations("generation.audio");
  const tCommonActions = useTranslations("common.actions");

  return (
    <div className="flex flex-col gap-8 pb-20 overflow-x-hidden">
      <PageHeader
        title={
          <>
            <span className="text-white">{tAudio("title.leading")}</span>{" "}
            <span className="text-primary">{tAudio("title.accent")}</span>
          </>
        }
        subtitle={tAudio("subtitle")}
        rightSlot={
          <GenerationHeaderActions
            actions={[
              {
                label: tCommonActions("loadPreset"),
                icon: <FolderOpen className="h-4 w-4" />,
                disabled: true,
                title: tCommonActions("comingSoon"),
              },
              {
                label: tCommonActions("clear"),
                icon: <Trash2 className="h-4 w-4" />,
                disabled: true,
                title: tCommonActions("comingSoon"),
              },
            ]}
          />
        }
        rightSlotClassName="w-full md:w-auto"
      />

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8">
        <AudioGenerationForm isAuthenticated={isAuthenticated} />
      </div>
    </div>
  );
}
