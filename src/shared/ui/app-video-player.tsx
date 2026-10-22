"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ComponentProps, type CSSProperties, type Ref } from "react";
import { Captions, LoaderCircle, Maximize, Minimize, PictureInPicture2 } from "lucide-react";
import { useLocale } from "next-intl";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { cn } from "@/shared/lib/utils";
import { AppButton } from "./app-button";
import { AppMediaPlayerControls } from "./app-media-player-controls";
import { mediaIsFullscreen, mediaTimeLabel, useAppMediaPlayer, type AppMediaSettings } from "./use-app-media-player";
import { useAppVideoPreviewPolicy } from "./use-app-video-preview-policy";
import styles from "./app-media-player.module.css";

export type AppVideoPlayerProps = Omit<ComponentProps<"video">, "src" | "controls"> & {
  src: string; active?: boolean; embedded?: boolean; controls?: boolean; inlineOnly?: boolean;
  mediaRef?: Ref<HTMLVideoElement>; mediaClassName?: string;
  /** Free static reference previews on visibility loss; playback keeps position by default. */
  releaseWhenInactive?: boolean;
  autoPreview?: { selected?: boolean; hovered?: boolean };
  captionsSrc?: string; captionsLang?: string; captionsLabel?: string;
};

/** Ref/mediaRef target the video, including when custom controls are visible. */
export function AppVideoPlayer(props: AppVideoPlayerProps) {
  const [settings, setSettings] = useState<AppMediaSettings>(() => ({ rate: 1, volume: 1, muted: props.muted ?? false }));
  const [previousMuted, setPreviousMuted] = useState(props.muted);
  if (props.muted !== previousMuted) {
    setPreviousMuted(props.muted);
    if (props.muted !== undefined) setSettings({ ...settings, muted: props.muted });
  }
  return <VideoSource key={props.src} {...props} settings={settings} onSettingsChange={setSettings} />;
}
function VideoSource({ src, active = true, embedded = false, controls = true, inlineOnly = false, autoPreview,
  className, mediaClassName, title, mediaRef, ref, settings, onSettingsChange, preload = "metadata", playsInline = true,
  disablePictureInPicture, controlsList, captionsSrc, captionsLang = "en", captionsLabel = "Captions", children, releaseWhenInactive = false, ...mediaProps }: AppVideoPlayerProps & {
  settings: AppMediaSettings; onSettingsChange: (settings: AppMediaSettings) => void;
}) {
  const tc = useCanvasTranslation(), locale = useLocale(), ko = locale === "ko";
  const root = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), caption = useRef<HTMLTrackElement>(null);
  useImperativeHandle(ref, () => video.current!, []);
  useImperativeHandle(mediaRef, () => video.current!, []);
  const player = useAppMediaPlayer({ mediaRef: video, src, active, settings, onSettingsChange, policyOwnsPause: Boolean(autoPreview), releaseWhenInactive, pauseWhenHidden: true });
  useAppVideoPreviewPolicy(video, active, autoPreview);
  const [capabilities, setCapabilities] = useState({ fullscreen: false, pip: false });
  const attachRoot = useCallback((element: HTMLDivElement | null) => {
    root.current = element;
    if (element) setCapabilities({
      fullscreen: Boolean(document.fullscreenEnabled && element.requestFullscreen),
      pip: Boolean(document.pictureInPictureEnabled && video.current?.requestPictureInPicture),
    });
  }, []);
  const [fullscreen, setFullscreen] = useState(false), [pip, setPip] = useState(false), [captionsOn, setCaptionsOn] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => {
    const element = video.current;
    const container = root.current;
    const changed = () => setFullscreen(Boolean(element && mediaIsFullscreen(element)));
    const pipChanged = () => setPip(document.pictureInPictureElement === element);
    document.addEventListener("fullscreenchange", changed);
    element?.addEventListener("enterpictureinpicture", pipChanged);
    element?.addEventListener("leavepictureinpicture", pipChanged);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      element?.removeEventListener("enterpictureinpicture", pipChanged);
      element?.removeEventListener("leavepictureinpicture", pipChanged);
      if (document.pictureInPictureElement === element) void document.exitPictureInPicture?.().catch(() => undefined);
      if (container && document.fullscreenElement === container) void document.exitFullscreen?.().catch(() => undefined);
    };
  }, [inlineOnly, disablePictureInPicture]);
  const toggleFullscreen = async () => {
    const element = root.current;
    if (!element) return;
    try {
      if (document.fullscreenElement === element) await document.exitFullscreen();
      else await element.requestFullscreen();
      if (element.isConnected) setActionError(null);
    } catch { if (element.isConnected) setActionError(ko ? "전체 화면을 사용할 수 없습니다." : "Full screen is unavailable."); }
  };
  const togglePip = async () => {
    const element = video.current;
    if (!element) return;
    try {
      if (document.pictureInPictureElement === element) await document.exitPictureInPicture();
      else await element.requestPictureInPicture();
      if (element.isConnected) setActionError(null);
    } catch { if (element.isConnected) setActionError(ko ? "화면 속 화면을 사용할 수 없습니다." : "Picture in Picture is unavailable."); }
  };
  const media = <video {...mediaProps} ref={video} preload={active ? preload : "none"} controls={false} playsInline={playsInline}
    controlsList={inlineOnly ? "nofullscreen" : controlsList} disablePictureInPicture={inlineOnly || disablePictureInPicture || undefined}
    aria-label={mediaProps["aria-label"] ?? title ?? tc("Video preview")} title={title}
    className={controls ? cn(styles.videoMedia, mediaClassName) : cn(className, mediaClassName)}>
    {captionsSrc && <track ref={caption} key={captionsSrc} kind="captions" src={captionsSrc} srcLang={captionsLang} label={captionsLabel} />}
    {children}
  </video>;
  if (!controls) return media;
  return <div ref={attachRoot} className={cn(styles.video, embedded && styles.embedded, "nodrag nopan nowheel", className)} data-app-video-player=""
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    {media}
    <input className={styles.timeline} type="range" aria-label={tc("Playback position")} min={0} max={player.duration || 0} step="0.1"
      style={{ "--media-progress": `${player.duration ? Math.max(0, Math.min(100, player.position / player.duration * 100)) : 0}%` } as CSSProperties}
      value={Math.min(player.position, player.duration || 0)} disabled={!player.ready || !player.duration}
      aria-valuetext={`${mediaTimeLabel(player.position)} / ${mediaTimeLabel(player.duration)}`} onChange={event => player.seek(Number(event.target.value))}
      onKeyDown={event => {
        const next = event.key === "Home" ? 0 : event.key === "End" ? player.duration
          : event.key === "ArrowRight" || event.key === "ArrowUp" ? player.position + 5
            : event.key === "ArrowLeft" || event.key === "ArrowDown" ? player.position - 5 : null;
        if (next !== null) { event.preventDefault(); player.seek(next); }
        if (event.key === " ") { event.preventDefault(); player.togglePlay(); }
      }} />
    <AppMediaPlayerControls {...player} settings={settings} title={title}>
      {captionsSrc && <AppButton type="button" variant="ghost" size="icon-sm" className={styles.control} aria-label={ko ? "자막" : "Toggle captions"} aria-pressed={captionsOn}
        disabled={!player.ready} onClick={() => { const track = caption.current?.track; if (track) { track.mode = captionsOn ? "disabled" : "showing"; setCaptionsOn(!captionsOn); } }}><Captions /></AppButton>}
      {capabilities.pip && !inlineOnly && !disablePictureInPicture && <AppButton type="button" variant="ghost" size="icon-sm" className={styles.control} disabled={!player.ready} aria-pressed={pip}
        aria-label={ko ? "화면 속 화면" : "Picture in Picture"} onClick={() => void togglePip()}><PictureInPicture2 /></AppButton>}
      {capabilities.fullscreen && !inlineOnly && <AppButton type="button" variant="ghost" size="icon-sm" className={styles.control}
        aria-label={ko ? (fullscreen ? "전체 화면 종료" : "전체 화면") : (fullscreen ? "Exit full screen" : "Enter full screen")} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize /> : <Maximize />}</AppButton>}
    </AppMediaPlayerControls>
    {(!player.ready || player.buffering) && !player.error && <span className={styles.status} role="status"><LoaderCircle className={styles.spinner} aria-hidden="true" />{ko ? (player.buffering ? "버퍼링 중" : "불러오는 중") : (player.buffering ? "Buffering" : "Loading video")}</span>}
    {player.error && <p className={styles.error} role="alert">{tc("Could not play the video. Try again.")} <AppButton type="button" variant="ghost" size="sm" onClick={() => player.togglePlay(true)}>{tc("Retry")}</AppButton></p>}
    {actionError && <p className={styles.error} role="status">{actionError}</p>}
  </div>;
}

export default AppVideoPlayer;
