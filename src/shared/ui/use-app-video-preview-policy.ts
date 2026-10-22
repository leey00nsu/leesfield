"use client";

/* Playback policy adapted from Node Banana's useVideoAutoplay.
 * Copyright (c) 2026 William Falloon. MIT License.
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { useEffect, useRef, type RefObject } from "react";
import { mediaIsPresented } from "./use-app-media-player";

export function useAppVideoPreviewPolicy(video: RefObject<HTMLVideoElement | null>, active: boolean,
  preview: { selected?: boolean; hovered?: boolean } | undefined) {
  const manuallyPaused = useRef(false), automaticPause = useRef(false);
  const enabled = Boolean(preview), selected = preview?.selected, hovered = preview?.hovered;
  const policy = useRef({ active, selected, hovered });
  useEffect(() => {
    const element = video.current;
    if (!element || !enabled) return;
    const onPause = () => {
      if (automaticPause.current) automaticPause.current = false;
      else if (!element.ended) manuallyPaused.current = true;
    };
    const onPlay = () => { manuallyPaused.current = false; };
    element.addEventListener("pause", onPause); element.addEventListener("play", onPlay);
    return () => { element.removeEventListener("pause", onPause); element.removeEventListener("play", onPlay); };
  }, [video, enabled]);
  useEffect(() => {
    const element = video.current;
    if (!element || !enabled) return;
    policy.current = { active, selected, hovered };
    let timer: ReturnType<typeof setTimeout> | undefined, disposed = false;
    const pause = () => { if (!element.paused) { automaticPause.current = true; element.pause(); } };
    const play = () => {
      if (disposed || manuallyPaused.current || document.hidden && !mediaIsPresented(element)) return;
      void element.play().then(() => {
        const current = policy.current;
        if (!element.isConnected || manuallyPaused.current) pause();
        else if ((!current.active || document.hidden || (!current.selected && !current.hovered)) && !mediaIsPresented(element)) pause();
      }).catch(() => undefined);
    };
    const apply = () => {
      clearTimeout(timer);
      if (!active || document.hidden || (!selected && !hovered)) { if (!mediaIsPresented(element)) pause(); return; }
      if (manuallyPaused.current || !element.paused) return;
      if (selected) play(); else timer = setTimeout(play, 300);
    };
    element.addEventListener("loadeddata", apply);
    document.addEventListener("fullscreenchange", apply); document.addEventListener("visibilitychange", apply);
    element.addEventListener("webkitendfullscreen", apply);
    element.addEventListener("enterpictureinpicture", apply); element.addEventListener("leavepictureinpicture", apply);
    apply();
    return () => {
      disposed = true; clearTimeout(timer);
      element.removeEventListener("loadeddata", apply);
      document.removeEventListener("fullscreenchange", apply); document.removeEventListener("visibilitychange", apply);
      element.removeEventListener("webkitendfullscreen", apply);
      element.removeEventListener("enterpictureinpicture", apply); element.removeEventListener("leavepictureinpicture", apply);
    };
  }, [video, active, selected, hovered, enabled]);
}
