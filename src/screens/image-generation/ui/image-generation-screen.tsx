import { FolderOpen, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { ImageGenerationForm } from "@/features/image-generation/ui/image-generation-form";
import { GenerationHeaderActions } from "@/shared/ui/generation-header-actions";
import { PageHeader } from "@/shared/ui/page-header";

type ImageGenerationScreenProps = {
  isAuthenticated: boolean;
};

export function ImageGenerationScreen({
  isAuthenticated,
}: ImageGenerationScreenProps) {
  const tImage = useTranslations("generation.image");
  const tCommonActions = useTranslations("common.actions");

  return (
    <div className="flex flex-col gap-8 pb-20 overflow-x-hidden">
      <PageHeader
        title={
          <>
            <span className="text-white">{tImage("title.leading")}</span>{" "}
            <span className="text-primary">{tImage("title.accent")}</span>
          </>
        }
        subtitle={tImage("subtitle")}
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
        <ImageGenerationForm isAuthenticated={isAuthenticated} />
      </div>
    </div>
  );
}
