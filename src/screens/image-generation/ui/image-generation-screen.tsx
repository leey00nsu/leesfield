import { ImageGenerationForm } from "@/features/image-generation/ui/image-generation-form";

type ImageGenerationScreenProps = {
  isAuthenticated: boolean;
};

export function ImageGenerationScreen({
  isAuthenticated,
}: ImageGenerationScreenProps) {
  return (
    <div className="overflow-x-hidden pb-20">
      <ImageGenerationForm isAuthenticated={isAuthenticated} />
    </div>
  );
}
