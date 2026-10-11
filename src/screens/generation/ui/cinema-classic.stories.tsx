import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ImageGenerationForm } from "@/features/image-generation/ui/image-generation-form";
import { VideoGenerationForm } from "@/features/video-generation/ui/video-generation-form";
import { GenerationQueryContext } from "@/shared/lib/generation/query-context";
import { runtimeImageModelsFixture, runtimeVideoModelsFixture } from "@/test-utils/fixtures/runtime-model-catalog";

function ClassicCinemaPreview({ media = "image" }: { media?: "image" | "video" }) {
  const [client] = useState(() => {
    const query = new QueryClient({ defaultOptions: { queries: { enabled: false, staleTime: Infinity, retry: false } } });
    query.setQueryData(["runtime-models"], [...runtimeImageModelsFixture, ...runtimeVideoModelsFixture]);
    query.setQueryData(["prompt-presets", media, false], []);
    return query;
  });
  const [params] = useState(() => new URLSearchParams({ prompt: "A woman walking across an old city square" }));
  return <QueryClientProvider client={client}><GenerationQueryContext.Provider value={params}><main className="mx-auto max-w-3xl p-4 sm:p-8">{media === "image" ? <ImageGenerationForm isAuthenticated /> : <VideoGenerationForm isAuthenticated />}</main></GenerationQueryContext.Provider></QueryClientProvider>;
}
const meta = { title: "Project Design/Generation/Cinema Classic", component: ClassicCinemaPreview, args: { media: "image" }, parameters: { layout: "fullscreen", viewport: { options: {
  cinema360: { name: "Cinema 360", styles: { width: "360px", height: "800px" }, type: "mobile" },
  cinema768: { name: "Cinema 768", styles: { width: "768px", height: "900px" }, type: "tablet" },
  cinema1440: { name: "Cinema 1440", styles: { width: "1440px", height: "900px" }, type: "desktop" },
} } } } satisfies Meta<typeof ClassicCinemaPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Image: Story = {};
export const Video: Story = { args: { media: "video" } };
