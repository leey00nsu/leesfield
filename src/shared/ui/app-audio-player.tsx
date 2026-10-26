"use client";

import { useImperativeHandle, useRef, useState, type ComponentProps, type Ref } from "react";
import { LoaderCircle } from "lucide-react";
import { useLocale } from "next-intl";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { cn } from "@/shared/lib/utils";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { getMediaAssetName } from "@/shared/media-assets/media-asset-name";
import { AppButton } from "./app-button";
import { AppMediaPreviewLoading } from "./app-media-preview-loading";
import { AppMediaPlayerControls } from "./app-media-player-controls";
import { AudioWaveformGraphic } from "./app-audio-waveform";
import { mediaTimeLabel, useAppMediaPlayer, type AppMediaSettings } from "./use-app-media-player";
import { audioSourceKey, useAudioWaveform } from "./use-audio-waveform";
import styles from "./app-media-player.module.css";

export type AppAudioPlayerProps = Omit<ComponentProps<"audio">, "src" | "controls"> & {
  src: string; asset?: MediaAssetDto; active?: boolean; embedded?: boolean; controls?: boolean;
  mediaRef?: Ref<HTMLAudioElement>; mediaClassName?: string;
};

/** className styles the player, or the media element in controls=false mode. */
export function AppAudioPlayer(props: AppAudioPlayerProps) {
  const [settings, setSettings] = useState<AppMediaSettings>(() => ({ rate: 1, volume: 1, muted: props.muted ?? false }));
  const [previousMuted, setPreviousMuted] = useState(props.muted);
  if (props.muted !== previousMuted) {
    setPreviousMuted(props.muted);
    if (props.muted !== undefined) setSettings({ ...settings, muted: props.muted });
  }
  return <AudioSource key={audioSourceKey(props.src, props.asset)} {...props} settings={settings} onSettingsChange={setSettings} />;
}
function AudioSource({ src, asset, active = true, embedded = false, controls = true, className, mediaClassName, title,
  mediaRef, ref, settings, onSettingsChange, preload = "none", ...mediaProps }: AppAudioPlayerProps & {
  settings: AppMediaSettings; onSettingsChange: (settings: AppMediaSettings) => void;
}) {
  const tc = useCanvasTranslation(), locale = useLocale();
  const audio = useRef<HTMLAudioElement>(null);
  useImperativeHandle(ref, () => audio.current!, []);
  useImperativeHandle(mediaRef, () => audio.current!, []);
  const waveform = useAudioWaveform(src, asset, active && controls);
  const player = useAppMediaPlayer({ mediaRef: audio, src, active, settings, onSettingsChange,
    durationHint: waveform.duration || (asset?.durationMs ?? 0) / 1000 });
  const progress = player.duration > 0 ? Math.min(1, player.position / player.duration) : 0;
  const media = <audio {...mediaProps} ref={audio} preload={active ? preload : "none"} controls={false}
    aria-label={mediaProps["aria-label"] ?? title ?? tc("Audio")} title={title}
    className={controls ? mediaClassName : cn(className, mediaClassName)} />;
  if (!controls) return media;
  return <div className={cn(styles.audio, embedded && styles.embedded, "nodrag nopan nowheel", className)} data-app-audio-player=""
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    {media}
    {(title || asset) && !embedded && <span className={styles.filename} title={title ?? getMediaAssetName(asset!)}>{title ?? getMediaAssetName(asset!)}</span>}
    <div className={styles.waveform} data-space-audio-waveform={waveform.state} data-app-audio-waveform={waveform.state}>
      <AudioWaveformGraphic peaks={waveform.peaks} progress={progress} />
      {waveform.state === "loading" && <AppMediaPreviewLoading label={tc("Loading waveform...")} />}
      <input className={styles.waveformSeek} type="range" aria-label={tc("Playback position")}
        min={0} max={player.duration || 0} step="0.01" value={Math.min(player.position, player.duration || 0)} disabled={!player.duration}
        aria-valuetext={`${mediaTimeLabel(player.position)} / ${mediaTimeLabel(player.duration)}`} onChange={event => player.seek(Number(event.target.value))}
        onKeyDown={event => {
          const next = event.key === "Home" ? 0 : event.key === "End" ? player.duration
            : event.key === "ArrowRight" || event.key === "ArrowUp" ? player.position + 5
              : event.key === "ArrowLeft" || event.key === "ArrowDown" ? player.position - 5 : null;
          if (next !== null) { event.preventDefault(); player.seek(next); }
          if (event.key === " ") { event.preventDefault(); player.togglePlay(); }
        }} />
    </div>
    <AppMediaPlayerControls {...player} settings={settings} title={title} />
    {player.buffering && <span className={styles.status} role="status"><LoaderCircle className={styles.spinner} aria-hidden="true" />{locale === "ko" ? "버퍼링 중" : "Buffering"}</span>}
    {player.error && <p className={styles.error} role="alert">{locale === "ko" ? "오디오를 재생하지 못했습니다. 다시 시도해 주세요." : "Could not play the audio. Try again."} <AppButton type="button" variant="ghost" size="sm" onClick={() => player.togglePlay(true)}>{tc("Retry")}</AppButton></p>}
  </div>;
}

export default AppAudioPlayer;
