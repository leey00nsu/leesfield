"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export const appPlaybackRates = [0.5, 0.75, 1, 1.25, 1.5, 2];
export type AppMediaSettings = { rate: number; volume: number; muted: boolean };
export function mediaTimeLabel(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
export function mediaIsFullscreen(element: HTMLMediaElement) {
  return Boolean(document.fullscreenElement?.contains(element)
    || (element as HTMLVideoElement & { webkitDisplayingFullscreen?: boolean }).webkitDisplayingFullscreen);
}
export function mediaIsPresented(element: HTMLMediaElement) {
  return mediaIsFullscreen(element) || document.pictureInPictureElement === element;
}
export function releaseAppMedia(element: HTMLMediaElement) {
  element.pause();
  element.removeAttribute("src");
  element.load();
}
function applySettings(element: HTMLMediaElement, settings: AppMediaSettings, applying: { current: boolean }) {
  applying.current = true;
  try {
    element.preservesPitch = true;
    if (element.defaultPlaybackRate !== settings.rate) element.defaultPlaybackRate = settings.rate;
    if (element.playbackRate !== settings.rate) element.playbackRate = settings.rate;
    if (element.volume !== settings.volume) element.volume = settings.volume;
    if (element.muted !== settings.muted) element.muted = settings.muted;
  } finally { applying.current = false; }
}

/** Native decoder events own state. Each keyed player instance owns one source. */
export function useAppMediaPlayer({ mediaRef, src, active, durationHint = 0, settings, onSettingsChange, policyOwnsPause = false, releaseWhenInactive = false, pauseWhenHidden = false }: {
  mediaRef: RefObject<HTMLMediaElement | null>; src: string; active: boolean; durationHint?: number;
  settings: AppMediaSettings; onSettingsChange: (settings: AppMediaSettings) => void; policyOwnsPause?: boolean; releaseWhenInactive?: boolean;
  /** Video opts in; explicit audio keeps the native background playback behavior. */
  pauseWhenHidden?: boolean;
}) {
  const [state, setState] = useState({ playing: false, position: 0, duration: 0, ready: false, buffering: false, error: false });
  const settingsRef = useRef(settings), pendingSeek = useRef<number | null>(null), mounted = useRef(false), metadataSeen = useRef(false);
  const playRequest = useRef(0), playWanted = useRef(false);
  const applyingSettings = useRef(false);
  const duration = state.duration || durationHint;

  useEffect(() => {
    const element = mediaRef.current;
    if (!element) return;
    mounted.current = true;
    const invalidatePlay = () => { playWanted.current = false; playRequest.current++; };
    const update = (event: Event) => {
      const type = event.type;
      if (!policyOwnsPause && pauseWhenHidden && document.hidden && !mediaIsPresented(element) && (type === "play" || type === "playing")) {
        invalidatePlay(); element.pause(); return;
      }
      if (type === "volumechange" || type === "ratechange") {
        // Source loading can reset browser defaults before metadata. Preserve
        // chosen preferences then; after metadata native controls own changes.
        if (applyingSettings.current || !metadataSeen.current && element.readyState < 1) return;
        const next = { rate: element.playbackRate, volume: element.volume, muted: element.muted };
        const previous = settingsRef.current;
        if (previous.rate !== next.rate || previous.volume !== next.volume || previous.muted !== next.muted) {
          settingsRef.current = next;
          onSettingsChange(next);
        }
        return;
      }
      if (type === "loadedmetadata" || type === "canplay") {
        applySettings(element, settingsRef.current, applyingSettings);
        metadataSeen.current = true;
        if (pendingSeek.current !== null) {
          const limit = Number.isFinite(element.duration) && element.duration > 0 ? element.duration : pendingSeek.current;
          try { element.currentTime = Math.max(0, Math.min(pendingSeek.current, limit)); pendingSeek.current = null; } catch { /* Retry on metadata. */ }
        }
      }
      if (type === "ended") { pendingSeek.current = null; if (!element.loop) element.currentTime = 0; }
      if (type === "pause" || type === "ended" || type === "error") { playWanted.current = false; playRequest.current++; }
      if (type === "error" && (!element.getAttribute("src") || !element.error)) return;
      if (type === "error") element.pause();
      setState(previous => ({
        playing: type === "ended" || type === "error" ? false : !element.paused && !element.ended,
        position: pendingSeek.current ?? (Number.isFinite(element.currentTime) ? element.currentTime : 0),
        duration: Number.isFinite(element.duration) && element.duration > 0 ? element.duration : previous.duration,
        ready: type === "loadedmetadata" || type === "canplay" || element.readyState >= 1 || previous.ready,
        buffering: type === "waiting" || type === "stalled" ? true : ["playing", "canplay", "pause", "ended", "error"].includes(type) ? false : previous.buffering,
        error: type === "error" ? true : ["play", "playing", "loadeddata", "canplay"].includes(type) ? false : previous.error,
      }));
    };
    const events = ["play", "playing", "pause", "timeupdate", "loadedmetadata", "durationchange", "canplay", "loadeddata", "waiting", "stalled", "ended", "error", "volumechange", "ratechange"];
    events.forEach(event => element.addEventListener(event, update));
    const hidden = () => {
      if (!policyOwnsPause && pauseWhenHidden && document.hidden && !mediaIsPresented(element)) {
        playWanted.current = false; playRequest.current++; element.pause();
      }
    };
    document.addEventListener("visibilitychange", hidden);
    document.addEventListener("fullscreenchange", hidden);
    element.addEventListener("leavepictureinpicture", hidden);
    element.addEventListener("webkitendfullscreen", hidden);
    return () => {
      mounted.current = false; invalidatePlay();
      events.forEach(event => element.removeEventListener(event, update));
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("fullscreenchange", hidden);
      element.removeEventListener("leavepictureinpicture", hidden);
      element.removeEventListener("webkitendfullscreen", hidden);
      releaseAppMedia(element);
    };
  }, [mediaRef, onSettingsChange, policyOwnsPause, pauseWhenHidden]);
  useEffect(() => {
    settingsRef.current = settings;
    if (mediaRef.current) applySettings(mediaRef.current, settings, applyingSettings);
  }, [settings, mediaRef]);
  useEffect(() => {
    const element = mediaRef.current;
    if (!element) return;
    if (active && src && !element.getAttribute("src")) element.src = src;
    applySettings(element, settingsRef.current, applyingSettings);
    if (!active && !policyOwnsPause && !mediaIsPresented(element)) {
      playWanted.current = false; playRequest.current++; element.pause();
      if (releaseWhenInactive && element.getAttribute("src")) releaseAppMedia(element);
    }
  }, [active, src, mediaRef, policyOwnsPause, releaseWhenInactive]);

  const updateSettings = (patch: Partial<AppMediaSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    onSettingsChange(next);
    if (mediaRef.current) applySettings(mediaRef.current, next, applyingSettings);
  };
  const togglePlay = (retry = false) => {
    const element = mediaRef.current;
    if (!element || !src) return;
    if (!element.paused && !retry) { playWanted.current = false; playRequest.current++; element.pause(); return; }
    if (!element.getAttribute("src")) element.src = src;
    if (retry && element.error) element.load();
    applySettings(element, settingsRef.current, applyingSettings);
    if (element.ended) element.currentTime = 0;
    const request = ++playRequest.current;
    playWanted.current = true;
    setState(previous => ({ ...previous, error: false }));
    // Explicit playback remains available for deferred audio; automatic consumers
    // own their policy and handle its pending promise independently.
    void element.play().then(() => {
      const hidden = pauseWhenHidden && document.hidden && !mediaIsPresented(element);
      // A completed older request must leave a newer play intent alone, while
      // every completion still honors teardown and the latest pause intent.
      if (request !== playRequest.current && mounted.current && playWanted.current && !hidden) return;
      if (!mounted.current || !playWanted.current || hidden) element.pause();
    }).catch(error => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (mounted.current && playRequest.current === request && mediaRef.current === element && element.isConnected) {
        setState(previous => ({ ...previous, playing: false, buffering: false, error: true }));
      }
    });
  };
  const seek = (value: number) => {
    const element = mediaRef.current;
    if (!element || !Number.isFinite(value) || !duration) return;
    const next = Math.max(0, Math.min(duration, value));
    pendingSeek.current = next;
    setState(previous => ({ ...previous, position: next }));
    try { element.currentTime = next; if (element.readyState >= 1) pendingSeek.current = null; } catch { /* Deferred source. */ }
  };
  return { ...state, duration, seek, togglePlay, updateSettings };
}
