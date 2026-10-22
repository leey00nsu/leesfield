"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { useLocale } from "next-intl";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger } from "@/shared/ui/app-dropdown-menu";
import type { SpaceVideoCapturePosition } from "../../lib/space-video-capture";
import { useSpaceEditor, useSpaceSelector, useSpaceViewSelector } from "../space-editor-provider";
import { ToolbarButton } from "../space-editor-toolbar";
import styles from "../space-editor-tools.module.css";

export function SpaceVideoCaptureMenu({ nodeId, asset, getVideo }: { nodeId: string; asset?: MediaAssetDto; getVideo: () => HTMLVideoElement | null }) {
  const scope = useSpaceEditor(), ko = useLocale() === "ko";
  const writable = useSpaceSelector(state => state.writable && !state.disposed);
  const available = useSpaceViewSelector(state => Boolean(state.services.captureVideoFrame));
  const busy = useSpaceSelector(state => state.runtimeByNode.get(nodeId)?.submissionPending === true || state.runtimeByNode.get(nodeId)?.uploadProgress !== undefined);
  const [currentAvailable, setCurrentAvailable] = useState(false);
  const capture = (position: SpaceVideoCapturePosition) => {
    if (!writable || !available || busy || asset?.type !== "video" || asset.status !== "completed") return;
    const graphId = scope.session.getSnapshot().id;
    void scope.view.getState().services.captureVideoFrame?.(nodeId, asset, position).catch(() => {
      const state = scope.session.getSnapshot();
      if (!state.disposed && state.id === graphId) scope.view.getState().services.onError?.(new Error(
        ko ? "프레임을 캡처하지 못했습니다. 다시 시도해 주세요." : "Could not capture the frame. Please try again."));
    });
  };
  const disabled = !writable || !available || busy || asset?.type !== "video" || asset.status !== "completed";
  const label = ko ? "프레임 캡처" : "Capture frame";
  return <AppDropdownMenu onOpenChange={open => { if (open) { const media = getVideo(); setCurrentAvailable(Boolean(media && media.readyState >= 2)); } }}>
      <AppDropdownMenuTrigger asChild disabled={disabled}>
        <ToolbarButton className={styles.toolButton} help={label}
          aria-label={label} aria-busy={busy}
          disabled={disabled} onPointerDown={event => event.stopPropagation()}
          onKeyDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
          <Camera size={16} aria-hidden="true" />
        </ToolbarButton>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="end" data-app-overlay-scope="canvas" className="w-48 nodrag nopan nowheel" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
        <AppDropdownMenuItem disabled={!currentAvailable} onClick={() => {
          const media = getVideo();
          if (media && media.readyState >= 2 && Number.isFinite(media.currentTime)) void capture(media.currentTime);
        }}>{ko ? "현재 프레임 캡처" : "Capture current frame"}</AppDropdownMenuItem>
        <AppDropdownMenuItem onClick={() => void capture("first")}>{ko ? "첫 프레임 캡처" : "Capture first frame"}</AppDropdownMenuItem>
        <AppDropdownMenuItem onClick={() => void capture("last")}>{ko ? "끝 프레임 캡처" : "Capture last frame"}</AppDropdownMenuItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>;
}
