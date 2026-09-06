import { useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { calculateNodeSizePreservingHeight } from "@/utils/nodeDimensions";

type Dimensions = { width: number; height: number } | null;

/**
 * Auto-resizes a node when its output media URL changes, preserving any
 * manually set height. Runs the resize inside requestAnimationFrame to avoid
 * conflicting with React Flow's own updates.
 *
 * @param nodeId the node to resize
 * @param mediaUrl current output media URL (image/video)
 * @param getDims resolver that returns the media's intrinsic dimensions
 */
export function useAutoResizeOnMedia(
  nodeId: string,
  mediaUrl: string | null | undefined,
  getDims: (url: string) => Promise<Dimensions>
) {
  const { setNodes } = useReactFlow();
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Only resize when the media URL transitions from null/different to a new value
    if (!mediaUrl || mediaUrl === prevUrlRef.current) {
      prevUrlRef.current = mediaUrl ?? null;
      return;
    }
    prevUrlRef.current = mediaUrl;

    let cancelled = false;

    // Use requestAnimationFrame to avoid React Flow update conflicts
    const rafId = requestAnimationFrame(() => {
      getDims(mediaUrl).then((dims) => {
        // Bail if a newer mediaUrl superseded this effect before getDims resolved
        if (cancelled || !dims) return;

        const aspectRatio = dims.width / dims.height;

        setNodes((nodes) =>
          nodes.map((node) => {
            if (node.id !== nodeId) return node;

            // Preserve user's manually set height if present
            const currentHeight =
              typeof node.style?.height === "number" ? node.style.height : undefined;

            const newSize = calculateNodeSizePreservingHeight(aspectRatio, currentHeight);

            return { ...node, style: { ...node.style, width: newSize.width, height: newSize.height } };
          })
        );
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [nodeId, mediaUrl, setNodes, getDims]);
}
