import { useRef, useEffect } from "react";
import { useWorkflowStore } from "@/store/workflowStore";

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
): React.RefObject<HTMLVideoElement | null> {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHovered = useWorkflowStore((s) => s.hoveredNodeId === nodeId);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Clear any pending hover timeout
    const clearHoverTimeout = () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
    };

    if (selected || isHovered) {
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
      video.pause();
      // Note: Do NOT reset currentTime - resume from current position
    }

    // Cleanup on unmount or dependency change
    return () => {
      clearHoverTimeout();
    };
  }, [isHovered, selected, nodeId]);

  return videoRef;
}
