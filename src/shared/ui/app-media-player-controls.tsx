"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Gauge, Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react";
import { useLocale } from "next-intl";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { cn } from "@/shared/lib/utils";
import { AppButton } from "./app-button";
import { AppPopover, AppPopoverContent, AppPopoverTrigger } from "./app-popover";
import { AppRangeSlider } from "./app-range-slider";
import { appPlaybackRates as playbackRates, mediaTimeLabel, type AppMediaSettings } from "./use-app-media-player";
import styles from "./app-media-player.module.css";

export function AppMediaPlayerControls({ playing, position, duration, settings, updateSettings, togglePlay, title, children }: {
  playing: boolean; position: number; duration: number; settings: AppMediaSettings;
  updateSettings: (patch: Partial<AppMediaSettings>) => void; togglePlay: () => void; title?: string; children?: ReactNode;
}) {
  const tc = useCanvasTranslation(), locale = useLocale();
  const root = useRef<HTMLDivElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const syncPortalContainer = useCallback(() => {
    const fullscreen = document.fullscreenElement;
    setPortalContainer(fullscreen instanceof HTMLElement && root.current && fullscreen.contains(root.current) ? fullscreen : null);
  }, []);
  const attachRoot = useCallback((element: HTMLDivElement | null) => {
    root.current = element;
    if (element) syncPortalContainer();
  }, [syncPortalContainer]);
  useEffect(() => {
    document.addEventListener("fullscreenchange", syncPortalContainer);
    return () => document.removeEventListener("fullscreenchange", syncPortalContainer);
  }, [syncPortalContainer]);
  const [speedOpen, setSpeedOpen] = useState(false);
  const speedLabel = locale === "ko" ? "재생 속도" : "Playback speed";
  const volumeLabel = locale === "ko" ? "볼륨" : "Volume";
  const silent = settings.muted || settings.volume === 0;
  const muteLabel = locale === "ko" ? (silent ? "음소거 해제" : "음소거") : (silent ? "Unmute" : "Mute");
  return <div ref={attachRoot} className={styles.audioControls} role="group" aria-label={title ? `${title} controls` : undefined}>
    <div className={styles.playbackControls}>
      <AppButton type="button" variant="surface" size="icon-sm" className={styles.play} aria-label={tc(playing ? "Pause" : "Play")} onClick={() => togglePlay()}>{playing ? <Pause /> : <Play />}</AppButton>
      <span className={styles.time}>{mediaTimeLabel(position)} / {mediaTimeLabel(duration)}</span>
    </div>
    <div className={styles.settingsControls}>
      <AppPopover open={speedOpen} onOpenChange={setSpeedOpen}>
        <AppPopoverTrigger asChild>
          <AppButton type="button" variant="ghost" size="icon-sm" className={cn(styles.control, styles.speedControl)}
            aria-label={`${speedLabel}: ${settings.rate}×`} title={speedLabel}><Gauge /><span>{settings.rate}×</span></AppButton>
        </AppPopoverTrigger>
        <AppPopoverContent portal={portalContainer ? { container: portalContainer } : undefined} side="top" align="end" className={cn(styles.settingsPopover, "nodrag nopan nowheel")} aria-label={speedLabel}
          onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
          <p className={styles.settingLabel}>{speedLabel}</p>
          <div role="radiogroup" aria-label={speedLabel} className={styles.speedOptions} onKeyDown={event => {
            const index = playbackRates.indexOf(settings.rate);
            const next = event.key === "Home" ? 0 : event.key === "End" ? playbackRates.length - 1
              : event.key === "ArrowRight" || event.key === "ArrowDown" ? (index + 1) % playbackRates.length
                : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index + playbackRates.length - 1) % playbackRates.length : null;
            if (next === null) return;
            event.preventDefault();
            updateSettings({ rate: playbackRates[next] });
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
          }}>
            {playbackRates.map(rate => <AppButton key={rate} type="button" variant="ghost" size="sm" role="radio"
              aria-checked={settings.rate === rate} tabIndex={settings.rate === rate ? 0 : -1} className={styles.speedOption}
              onClick={() => { updateSettings({ rate }); setSpeedOpen(false); }}>{rate}×</AppButton>)}
          </div>
        </AppPopoverContent>
      </AppPopover>
      <AppPopover>
        <AppPopoverTrigger asChild>
          <AppButton type="button" variant="ghost" size="icon-sm" className={styles.control} aria-label={volumeLabel} title={volumeLabel}><Volume1 /></AppButton>
        </AppPopoverTrigger>
        <AppPopoverContent portal={portalContainer ? { container: portalContainer } : undefined} side="top" align="end" className={cn(styles.settingsPopover, styles.volumePopover, "nodrag nopan nowheel")} aria-label={volumeLabel}
          onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
          <div className={styles.settingHeading}><span className={styles.settingLabel}>{volumeLabel}</span><span className={styles.volumeValue}>{Math.round(settings.volume * 100)}%</span></div>
          <AppRangeSlider min={0} max={100} step={1} value={[Math.round(settings.volume * 100)]} labels={[volumeLabel]}
            onValueChange={([value]) => { const volume = Math.max(0, Math.min(100, value)) / 100; updateSettings({ volume, muted: volume === 0 }); }} />
        </AppPopoverContent>
      </AppPopover>
      <AppButton type="button" variant="ghost" size="icon-sm" className={styles.control} aria-label={muteLabel} title={muteLabel} aria-pressed={silent}
        onClick={() => updateSettings(silent ? { muted: false, volume: settings.volume || 1 } : { muted: true })}>{silent ? <VolumeX /> : <Volume2 />}</AppButton>
      {children}
    </div>
  </div>;
}
