"use client";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Keyboard, Magnet, Pause, Play, Repeat2, X } from "lucide-react";
import { useLocale } from "next-intl";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import type { DirectEdit } from "@/shared/media-assets/direct-media-edit";
import { AppVideoPlayer } from "@/shared/ui/app-video-player";
import { AppPopover, AppPopoverContent, AppPopoverTrigger } from "@/shared/ui/app-popover";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { useSpaceFilmstrip } from "../../hook/use-space-filmstrip";
import { adjustTrimRange, clampMediaTime, minimumTrimMs, trimKeyboardRange, type TrimGesture, type TrimRange } from "../../model/media-trim-range";
import { ToolbarButton } from "../space-editor-toolbar";
import styles from "./media-edit.module.css";

export type TrimEdit = Extract<DirectEdit, { kind: "video.trim" }>;
export function MediaTrimEditor({ asset, edit, onChange, onCancel, onConfirm, stageStyle, barStyle }: {
  asset: MediaAssetDto; edit: TrimEdit; onChange: (edit: TrimEdit) => void; onCancel: () => void; onConfirm: () => void;
  stageStyle?: CSSProperties; barStyle?: CSSProperties;
}) {
  const ko = useLocale() === "ko", label = (en: string, kr: string) => ko ? kr : en;
  const video = useRef<HTMLVideoElement>(null), bar = useRef<HTMLDivElement>(null), track = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState(false), [loop, setLoop] = useState(true), [playing, setPlaying] = useState(false), [position, setPosition] = useState(edit.startMs);
  const [error, setError] = useState<string | null>(null), [ready, setReady] = useState(false);
  const playIntent = useRef({ version: 0 }), current = useRef({ edit, loop });
  useEffect(() => { current.current = { edit, loop }; }, [edit, loop]);
  const filmstrip = useSpaceFilmstrip(asset, true), duration = asset.durationMs!;
  const drag = useRef<{ pointer: number; kind: TrimGesture | "head"; x: number; width: number; range: TrimRange } | null>(null);
  useEffect(() => {
    const intent = playIntent.current;
    bar.current?.focus({ preventScroll: true });
    return () => { intent.version++; };
  }, []);
  const seek = (ms: number) => {
    const element = video.current, next = clampMediaTime(ms, 0, duration);
    playIntent.current.version++; element?.pause();
    if (element && element.readyState >= 1) element.currentTime = next / 1000;
    setPosition(next);
  };
  const toggle = async () => {
    const element = video.current;
    if (!element || !ready) return;
    const intent = ++playIntent.current.version;
    if (!element.paused) { element.pause(); return; }
    if (element.currentTime * 1000 < edit.startMs || element.currentTime * 1000 >= edit.endMs - 1) element.currentTime = edit.startMs / 1000;
    setError(null);
    try { await element.play(); if (playIntent.current.version !== intent || !element.isConnected) element.pause(); }
    catch { if (playIntent.current.version === intent) setError(label("Could not play the video. Try again.", "영상을 재생하지 못했습니다. 다시 시도해 주세요.")); }
  };
  const constrainPlayback = () => {
    const element = video.current;
    if (!element) return;
    const { edit: range, loop: repeating } = current.current;
    if (!element.paused && (element.currentTime * 1000 >= range.endMs || element.ended)) {
      if (repeating) element.currentTime = range.startMs / 1000;
      else { element.pause(); element.currentTime = range.endMs / 1000; }
    } else if (!element.paused && element.currentTime * 1000 < range.startMs) element.currentTime = range.startMs / 1000;
    setPosition(Math.round(element.currentTime * 1000));
  };
  useEffect(() => {
    if (!playing) return;
    let frame: number;
    const tick = () => { constrainPlayback(); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  // current ref gives the running loop the latest selection without restarting playback.
  }, [playing]);
  const change = (range: TrimRange) => { onChange({ kind: "video.trim", ...range }); };
  const key = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing || event.keyCode === 229 || event.altKey || event.defaultPrevented) return;
    const target = event.target instanceof Element ? event.target : null;
    const command = event.metaKey || event.ctrlKey;
    if (event.key === "Escape") { event.preventDefault(); onCancel(); return; }
    if (target?.closest("button,[role=dialog]")) return;
    if (event.key === "Enter") { event.preventDefault(); onConfirm(); return; }
    if (event.key === " " && !command) { event.preventDefault(); void toggle(); return; }
    if (target?.hasAttribute("data-trim-head") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      seek(event.key === "Home" ? 0 : event.key === "End" ? duration : position + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 10 : 100)); return;
    }
    const next = trimKeyboardRange(edit, event.key, duration, position, event.shiftKey, command, snap);
    if (next) { event.preventDefault(); change(next); }
  };
  const start = (event: PointerEvent<HTMLDivElement>, kind: TrimGesture | "head") => {
    if (event.button !== 0 || !track.current) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus({ preventScroll: true });
    drag.current = { pointer: event.pointerId, kind, x: event.clientX, width: track.current.getBoundingClientRect().width, range: edit };
    playIntent.current.version++; video.current?.pause();
  };
  return <TooltipProvider delayDuration={250}>
    <div className={styles.trimStage} style={stageStyle} onKeyDown={key}>
      <AppVideoPlayer ref={video} src={asset.url} active controls={false} inlineOnly playsInline preload="metadata" aria-label={label("Trim preview", "구간 미리보기")}
        className={styles.original} onLoadedMetadata={event => { setReady(true); event.currentTarget.currentTime = edit.startMs / 1000; }}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={constrainPlayback} onEnded={() => {
          if (current.current.loop) { const e = video.current; if (e) { e.currentTime = current.current.edit.startMs / 1000; void toggle(); } }
          else setPlaying(false);
        }}
        onError={() => { setReady(false); setPlaying(false); setError(label("Video unavailable", "영상을 불러오지 못했습니다")); }} />
      {/* Metadata readiness replaces the disabled wrapper with the active tooltip trigger. */}
      <ToolbarButton key={ready ? "ready" : "loading"} help={label(playing ? "Pause (Space)" : "Play selection (Space)", playing ? "일시 정지 (Space)" : "선택 구간 재생 (Space)")}
        className={styles.previewPlay} aria-label={label(playing ? "Pause" : "Play selection", playing ? "일시 정지" : "선택 구간 재생")} aria-keyshortcuts="Space"
        disabled={!ready} onClick={() => void toggle()}>{playing ? <Pause size={20} /> : <Play size={20} />}</ToolbarButton>
    </div>
    <div ref={bar} className={styles.trimBar} style={barStyle} tabIndex={0} role="toolbar" aria-label={label("Trim controls", "구간 편집 도구")}
      data-media-trim data-filmstrip-status={filmstrip.status} onKeyDown={key}
      onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      <ToolbarButton help={label("Cancel editing (Esc)", "편집 취소 (Esc)")} aria-label={label("Cancel editing", "편집 취소")} aria-keyshortcuts="Escape" onClick={onCancel}><X size={18} /></ToolbarButton>
      <span className={styles.trimDivider} aria-hidden="true" />
      <AppPopover><AppPopoverTrigger asChild><ToolbarButton help={label("Keyboard shortcuts", "단축키")} aria-label={label("Keyboard shortcuts", "단축키")}><Keyboard size={18} /></ToolbarButton></AppPopoverTrigger>
        <AppPopoverContent data-app-overlay-scope="canvas" className={styles.help} onKeyDown={event => event.stopPropagation()}>
          <dl>{[
            ["← / →", label("Move selection", "구간 이동")], ["↑ / ↓", label("Shorten / extend", "구간 축소 / 확장")],
            ["I / O", label("Set in / out at playhead", "재생 헤드에서 인점 / 아웃점")], ["Shift", label("Fine adjustment · 0.01s", "정밀 조정 · 0.01초")],
            ["⌘/Ctrl + ↑ / ↓", label("Fast adjustment · 1s", "빠른 조정 · 1초")], ["Space", label("Play / pause selection", "선택 구간 재생 / 정지")],
            ["Enter", label("Confirm", "확인")], ["Esc", label("Cancel", "취소")],
          ].map(([shortcut, text]) => <div key={shortcut}><dt>{shortcut}</dt><dd>{text}</dd></div>)}</dl>
        </AppPopoverContent>
      </AppPopover>
      <div ref={track} className={styles.trimTrack} tabIndex={0} role="group" aria-label={label("Selected range", "선택 구간")}
        onPointerDown={event => {
          if (event.button !== 0) return;
          const r = event.currentTarget.getBoundingClientRect(); seek((event.clientX - r.left) / r.width * duration);
          start(event, "head");
        }} onPointerMove={event => {
          const d = drag.current;
          if (!d || d.pointer !== event.pointerId || !d.width) return;
          const delta = (event.clientX - d.x) / d.width * duration;
          if (d.kind === "head") { const r = track.current!.getBoundingClientRect(); seek((event.clientX - r.left) / r.width * duration); }
          else change(adjustTrimRange(d.range, d.kind, delta, duration, snap && !event.shiftKey));
        }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
        <div className={styles.filmstrip} aria-hidden="true">{filmstrip.images.length ? filmstrip.images.map((src, i) =>
          // Bounded local thumbnails, retained by the shared scheduler only while subscribed.
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt="" />) : <span>{label("Video", "영상")}</span>}</div>
        <div className={styles.trimShade} style={{ left: 0, width: edit.startMs / duration * 100 + "%" }} />
        <div className={styles.trimShade} style={{ right: 0, width: (1 - edit.endMs / duration) * 100 + "%" }} />
        <div className={styles.trimSelection} style={{ left: edit.startMs / duration * 100 + "%", width: (edit.endMs - edit.startMs) / duration * 100 + "%" }}
          onPointerDown={event => start(event, "move")} aria-label={label("Move selection", "구간 이동")}>
          <output className={styles.durationBadge} aria-live="polite">{((edit.endMs - edit.startMs) / 1000).toFixed(2)}s</output>
        </div>
        {(["start", "end"] as const).map(handle => <div key={handle} tabIndex={0} role="slider"
          aria-label={label(handle === "start" ? "Trim start" : "Trim end", handle === "start" ? "구간 시작" : "구간 끝")}
          aria-valuemin={handle === "start" ? 0 : edit.startMs + Math.min(minimumTrimMs, duration)} aria-valuemax={handle === "start" ? edit.endMs - Math.min(minimumTrimMs, duration) : duration}
          aria-valuenow={handle === "start" ? edit.startMs : edit.endMs} aria-valuetext={((handle === "start" ? edit.startMs : edit.endMs) / 1000).toFixed(2) + "s"}
          className={styles.trimHandle} data-trim-boundary={handle}
          style={{ left: (handle === "start" ? edit.startMs : edit.endMs) / duration * 100 + "%" }} onPointerDown={event => start(event, handle)}><span /></div>)}
        <div tabIndex={0} role="slider" aria-label={label("Playback position", "재생 위치")} aria-valuemin={0} aria-valuemax={duration}
          aria-valuenow={clampMediaTime(position, 0, duration)} aria-valuetext={(position / 1000).toFixed(2) + "s"}
          data-trim-head className={styles.trimHead} style={{ left: position / duration * 100 + "%" }} onPointerDown={event => start(event, "head")} />
      </div>
      <ToolbarButton help={label("Snap to seconds", "초 단위 스냅")} aria-label={label("Snap to seconds", "초 단위 스냅")} aria-pressed={snap} onClick={() => setSnap(v => !v)}><Magnet size={18} /></ToolbarButton>
      <ToolbarButton help={label("Loop selection", "구간 반복")} aria-label={label("Loop selection", "구간 반복")} aria-pressed={loop} onClick={() => setLoop(v => !v)}><Repeat2 size={18} /></ToolbarButton>
      <ToolbarButton help={label("Trim (Enter)", "자르기 (Enter)")} className={styles.trimConfirm} aria-label={label("Confirm trim", "구간 잘라내기 확인")} aria-keyshortcuts="Enter" onClick={onConfirm}>{label("Trim", "자르기")}</ToolbarButton>
      {error && <p role="alert" className={styles.trimError}>{error}</p>}
      {filmstrip.status === "error" && <p role="status" className={styles.trimError}>{label("Frame preview unavailable. You can still edit the range.", "프레임 미리보기를 불러오지 못했습니다. 구간은 계속 편집할 수 있습니다.")}</p>}
    </div>
  </TooltipProvider>;
}
