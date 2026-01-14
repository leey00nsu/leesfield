import { FolderOpen, Trash2 } from "lucide-react";
import { ImageGenerationForm } from "@/features/image-generation/ui/image-generation-form";
import { GenerationHeaderActions } from "@/shared/ui/generation-header-actions";
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
          <GenerationHeaderActions
            actions={[
              {
                label: "Load Preset",
                icon: <FolderOpen className="h-4 w-4" />,
                disabled: true,
                title: "준비 중",
              },
              {
                label: "Clear",
                icon: <Trash2 className="h-4 w-4" />,
                disabled: true,
                title: "준비 중",
              },
            ]}
          />
        }
        rightSlotClassName="w-full md:w-auto"
      />

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8">
        <ImageGenerationForm />
      </div>
    </div>
  );
}
