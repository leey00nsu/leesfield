import { useRef, useEffect, useState, useCallback } from "react";
import { useWorkflowStore } from "../leesfield/upstream-node-host";

/**
 * Hook for managing video play/pause based on hover and selection state.
 *
 * Videos are paused by default. They start playing when:
 * - The node is selected (immediately)
 * - The node is hovered for 300ms (delayed)
 *
 * Videos pause when:
 * - The node is deselected (if not hovered)
 * - The mouse leaves the node (if not selected)
 *
 * @param nodeId - The node's unique ID
 * @param selected - Whether the node is currently selected
 * @returns A ref to attach to the video element
 */
export function useVideoAutoplay(
  nodeId: string,
  selected: boolean | undefined
): React.RefCallback<HTMLVideoElement> {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const videoRef = useCallback((element: HTMLVideoElement | null) => setVideo(element), []);
  const manuallyPausedRef = useRef(false);
  const automaticPauseRef = useRef(false);
  useEffect(() => {
    manuallyPausedRef.current = false;
    automaticPauseRef.current = false;
    if (!video) return;
    const onPause = () => {
      if (automaticPauseRef.current) automaticPauseRef.current = false;
      else if (!video.ended && video.readyState >= 2) manuallyPausedRef.current = true;
    };
    const onPlay = () => { manuallyPausedRef.current = false; };
    const onEmptied = () => { manuallyPausedRef.current = false; automaticPauseRef.current = false; };
    video.addEventListener("pause", onPause);
    video.addEventListener("play", onPlay);
    video.addEventListener("emptied", onEmptied);
    return () => {
      video.removeEventListener("pause", onPause);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("emptied", onEmptied);
    };
  }, [video, nodeId]);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHovered = useWorkflowStore((s) => s.hoveredNodeId === nodeId);

  useEffect(() => {
    if (!video) return;

    // Clear any pending hover timeout
    const clearHoverTimeout = () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
    };

    const applyPlayback = () => {
    if (selected || isHovered) {
      if (manuallyPausedRef.current) { clearHoverTimeout(); return; }
      // Play the video
      if (selected) {
        // Selected: play immediately
        clearHoverTimeout();
        video.play().catch((e) => {
          if (e.name !== "AbortError") {
            console.warn("Video play failed:", e);
          }
        });
      } else if (isHovered) {
        // Hovered but not selected: play after 300ms delay
        clearHoverTimeout();
        hoverTimeoutRef.current = setTimeout(() => {
          if (manuallyPausedRef.current) return;
          video.play().catch((e) => {
            if (e.name !== "AbortError") {
              console.warn("Video play failed:", e);
            }
          });
        }, 300);
      }
    } else {
      // Not selected and not hovered: pause
      clearHoverTimeout();
      if (document.fullscreenElement?.contains(video) || (video as HTMLVideoElement & { webkitDisplayingFullscreen?: boolean }).webkitDisplayingFullscreen) return;
      automaticPauseRef.current = !video.paused;
      video.pause();
      // Note: Do NOT reset currentTime - resume from current position
    }
    };
    // A conditional/keyed video mount or deferred blob source can occur after
    // hover/selection. Resume the same policy when that source has decoded.
    video.addEventListener("loadeddata", applyPlayback);
    applyPlayback();

    // Cleanup on unmount or dependency change
    return () => {
      clearHoverTimeout();
      video.removeEventListener("loadeddata", applyPlayback);
    };
  }, [video, isHovered, selected, nodeId]);

  return videoRef;
}
