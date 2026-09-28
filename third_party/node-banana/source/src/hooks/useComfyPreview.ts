"use client";

import { useEffect, useState } from "react";

import { buildComfyHeaders, getComfySettings } from "@/lib/comfy/settings";

/**
 * The latest preview image for a running Comfy job.
 *
 * Held in component state rather than in the workflow store, deliberately. A
 * preview is a 70–80KB JPEG of a half-finished latent: it belongs to the run,
 * not to the node, and node data is what gets written into saved workflow
 * files. Keeping it here means there is no cleanup to get wrong — the run ends,
 * the component stops asking, the image goes.
 *
 * Returns null whenever there is nothing to show, which is the normal case for
 * a stock ComfyUI (no event stream) and for the first seconds of any run.
 */
export function useComfyPreview(jobId: string | null | undefined, active: boolean): string | null {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    // Cleared here on the way out too, so the next run never opens on the last
    // one's latent. The effect re-runs on both `active` and `jobId`, so this is
    // the only place that needs to do it.
    if (!active || !jobId) {
      setPreview(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      // The stream ends on its own when the job finishes, and the route is
      // bounded by its own maxDuration — so reopen while the run is still
      // going rather than treating the first close as the end.
      while (!cancelled) {
        try {
          const response = await fetch("/api/comfy/preview", {
            method: "POST",
            headers: buildComfyHeaders(getComfySettings()),
            body: JSON.stringify({ jobId }),
            signal: controller.signal,
          });
          // 204 is this engine saying it has no previews at all. Reconnecting
          // would be a pointless request every few seconds, forever.
          if (response.status === 204 || !response.ok || !response.body) return;

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffered = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done || cancelled) break;
            buffered += decoder.decode(value, { stream: true });
            const lines = buffered.split("\n");
            // The last piece may be half a frame; keep it for the next chunk.
            buffered = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const frame = JSON.parse(line) as { dataUrl?: string };
                if (frame.dataUrl) setPreview(frame.dataUrl);
              } catch {
                // A truncated frame is not worth failing the stream over.
              }
            }
          }
        } catch {
          // Aborted, or the connection dropped. The loop condition decides
          // whether that was the end.
        }
        if (cancelled) return;
        // Don't hammer a route that is refusing instantly.
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [jobId, active]);

  return preview;
}
