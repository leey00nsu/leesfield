import { VideoGenerationForm } from "@/features/video-generation/ui/video-generation-form";

type VideoGenerationScreenProps = {
  isAuthenticated: boolean;
};

export function VideoGenerationScreen({
  isAuthenticated,
}: VideoGenerationScreenProps) {
  return (
    <div className="overflow-x-hidden pb-20">
      <VideoGenerationForm isAuthenticated={isAuthenticated} />
    </div>
  );
}
