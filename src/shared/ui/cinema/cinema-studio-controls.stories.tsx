import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { defaultCinemaSettings } from "@/shared/cinema/cinema-contract";
import { AppCanvasOverlayProvider } from "@/shared/ui/app-overlay-scope";
import { CinemaStudioControls } from "./cinema-studio-controls";

function Preview({ media = "video", initialGroup, disabled = false, canvas = false, unsupported = false, supportsPrompt = true }: {
  media?: "image" | "video"; initialGroup?: "shooting" | "visual" | "narrative"; disabled?: boolean; canvas?: boolean; unsupported?: boolean; supportsPrompt?: boolean;
}) {
  const [settings, setSettings] = useState<unknown>(unsupported ? { schemaVersion: 8, camera: "future-camera" } : { ...defaultCinemaSettings(), camera: "modular-8k", lens: "modern-prime", composition: "medium", aperture: "f14" });
  const content = <div style={{ padding: 28, maxWidth: canvas ? 360 : 1000, margin: "auto" }}><CinemaStudioControls media={media} settings={settings} onChange={setSettings} disabled={disabled} initialGroup={initialGroup} supportsPrompt={supportsPrompt} /><textarea aria-label="Prompt" defaultValue="A woman crossing an old European square at dusk." style={{ width: "100%", padding: 18, marginTop: 12, background: "var(--card)", borderRadius: 12 }} /></div>;
  return canvas ? <AppCanvasOverlayProvider>{content}</AppCanvasOverlayProvider> : content;
}
const meta = { title: "Project Design/Generation/CinemaStudio", component: Preview, args: { media: "video", disabled: false, canvas: false, unsupported: false, supportsPrompt: true },
  parameters: { viewport: { options: {
    cinema360: { name: "Cinema 360", styles: { width: "360px", height: "800px" }, type: "mobile" },
    cinema768: { name: "Cinema 768", styles: { width: "768px", height: "900px" }, type: "tablet" },
    cinema1440: { name: "Cinema 1440", styles: { width: "1440px", height: "900px" }, type: "desktop" },
  } } },
} satisfies Meta<typeof Preview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Shooting: Story = { args: { initialGroup: "shooting" } };
export const Movement: Story = { args: { initialGroup: "shooting" }, play: async ({ canvasElement }) => {
  const tab = canvasElement.ownerDocument.querySelector<HTMLButtonElement>('[role="tab"][id$="-movement"]');
  tab?.click();
} };
export const VisualStyle: Story = { args: { initialGroup: "visual" } };
export const Narrative: Story = { args: { initialGroup: "narrative" } };
export const ImageControls: Story = { args: { media: "image" } };
export const SmallSpace: Story = { args: { canvas: true } };
export const Readonly: Story = { args: { disabled: true, initialGroup: "shooting" } };
export const UnsupportedSettings: Story = { args: { unsupported: true } };
export const PromptlessModel: Story = { args: { supportsPrompt: false } };
