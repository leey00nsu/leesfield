"use client";

import { useId } from "react";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { cn } from "@/shared/lib/utils";
import { useAudioWaveform } from "./use-audio-waveform";
import styles from "./app-audio-waveform.module.css";

export type AppAudioWaveformProps = {
  src: string;
  asset?: MediaAssetDto;
  /** The caller owns viewport visibility; inactive previews do no fetch/decode work. */
  active?: boolean;
  className?: string;
};

/** Silent visual preview. No media element, controls, or audio output is created. */
export function AppAudioWaveform({ src, asset, active = true, className }: AppAudioWaveformProps) {
  const waveform = useAudioWaveform(src, asset, active);
  return <span className={cn(styles.preview, className)} data-app-audio-waveform={waveform.state} aria-hidden="true">
    <AudioWaveformGraphic peaks={waveform.peaks} />
  </span>;
}

/** Shared peak geometry for static previews and the interactive player's progress overlay. */
export function AudioWaveformGraphic({ peaks, progress }: { peaks?: readonly number[]; progress?: number }) {
  const clipId = useId(), played = Math.max(0, Math.min(1, progress ?? 0));
  const path = peaks?.map((peak, index) => {
    const height = Math.max(1, Math.min(1, peak) * 56);
    return `M${(index + 0.5) * 512 / peaks.length},${32 - height / 2}v${height}`;
  }).join(" ");
  return <svg className={styles.graphic} viewBox="0 0 512 64" preserveAspectRatio="none" aria-hidden="true">
    {path ? <path d={path} className={styles.peaks} /> : <path d="M0 32H512" className={styles.peaks} />}
    {progress !== undefined && <>
      <defs><clipPath id={clipId}><rect width={512 * played} height="64" /></clipPath></defs>
      {path && <path d={path} className={styles.played} clipPath={`url(#${clipId})`} />}
      <path d={`M${Math.max(1, Math.min(511, 512 * played))} 4v56`} className={styles.played} />
    </>}
  </svg>;
}
