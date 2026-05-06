import { AudioGenerationForm } from "@/features/audio-generation/ui/audio-generation-form";

type AudioGenerationScreenProps = {
  isAuthenticated: boolean;
};

export function AudioGenerationScreen({
  isAuthenticated,
}: AudioGenerationScreenProps) {
  return (
    <div className="overflow-x-hidden pb-20">
      <AudioGenerationForm isAuthenticated={isAuthenticated} />
    </div>
  );
}
