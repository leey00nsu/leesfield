import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppAudioPlayer } from "./app-audio-player";
import { AppVideoPlayer } from "./app-video-player";

function MediaPlayerStates({ kind, embedded, controls, width }: {
  kind: "audio" | "video"; embedded: boolean; controls: boolean; width: number;
}) {
  // Local short WAV makes the waveform/control story independent of providers.
  const silence = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==";
  return <div style={{ width, height: embedded ? 280 : undefined }}>
    {kind === "audio" ? <AppAudioPlayer src={silence} title="Waveform recording" embedded={embedded} controls={controls} />
      : <AppVideoPlayer src="/assets/cinema/movements/dolly-in.mp4" title="Video preview" embedded={embedded} controls={controls} />}
  </div>;
}
const meta = {
  title: "Project Design/App/AppMediaPlayer",
  component: MediaPlayerStates,
  args: { kind: "audio", embedded: false, controls: true, width: 360 },
  parameters: { layout: "centered" },
} satisfies Meta<typeof MediaPlayerStates>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Audio: Story = {};
export const EmbeddedAudio: Story = { args: { embedded: true } };
export const Video: Story = { args: { kind: "video", width: 520 } };
export const CompactVideo: Story = { args: { kind: "video", width: 240, embedded: true } };
export const PreviewOnly: Story = { args: { kind: "video", controls: false } };
export const Deferred: Story = { render: () => <AppVideoPlayer src="/not-loaded.mp4" active={false} title="Deferred video" /> };
export const Unavailable: Story = { render: () => <AppVideoPlayer src="/missing-media-story.mp4" title="Unavailable video" /> };
