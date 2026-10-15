import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MediaAssetCard } from "./media-asset-card";
import { MediaAssetUploadCard } from "./media-asset-upload-card";
import { HistoryItem } from "@/features/generation-history/ui/history-item";
const meta = { title: "Project Design/Assets/Card", component: MediaAssetCard, decorators: [(Story, context) => <div className={context.args.presentation === "gallery" ? "w-full max-w-xl p-4" : "w-72 p-4"}><Story /></div>], args: {
  asset: { id: "asset_portrait_example", version: 1, name: "카페 인물 촬영", type: "image", status: "completed", origin: "generation", mimeType: "image/png", url: "/assets/cinema/previews/full.webp", bytes: "1024", width: 1024, height: 1024, durationMs: null, sourceOperationId: null, createdAt: "2026-10-13T00:00:00Z", updatedAt: "2026-10-13T00:00:00Z", starred: true, projectIds: ["portrait"] }, onSelect: () => {}, onDetails: () => {}, onStar: () => {},
} } satisfies Meta<typeof MediaAssetCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Selected: Story = { args: { selected: true } };
export const Restricted: Story = { args: { disabled: true } };
export const Gallery: Story = { args: { presentation: "gallery", onDetails: undefined } };
export const GalleryPicker: Story = { args: { presentation: "gallery", selected: true } };

export const FitPreview: Story = { args: { presentation: "gallery", fit: "contain" } };

export const MediaTypeComparison: Story = {
  args: { presentation: "gallery" },
  render: (args) => (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">에셋</p>
        <MediaAssetCard {...args} presentation="gallery" selected onDetails={undefined} />
      </div>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">히스토리</p>
        <HistoryItem item={{ id: args.asset.id, type: args.asset.type, status: "completed", prompt: "Cafe portrait", model: "Qwen Image", createdAt: args.asset.createdAt, resultUrl: args.asset.url, thumbnailUrl: null, errorMessage: null }} onSelect={() => {}} />
      </div>
    </div>
  ),
};

export const Uploading: Story = {
  args: { presentation: "gallery" },
  render: () => <div className="grid w-full grid-cols-2 gap-3">
    {["cafe-reference.png", "movement-preview.mp4"].map((name, index) => <MediaAssetUploadCard key={name}
      upload={{ id: String(index), file: new File([], name), preview: "", projectId: null, status: "uploading" }}
      onCancel={() => {}} onRetry={() => {}} onRemove={() => {}} />)}
  </div>,
};
