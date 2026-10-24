"use client";
import { Crop, MoreHorizontal, Scissors } from "lucide-react";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { useMediaAsset } from "@/features/media-assets/hook/use-media-assets";
import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger } from "@/shared/ui/app-dropdown-menu";
import { spaceOutputSource } from "../../model/space-editor-output";
import { useSpaceEditor, useSpaceResolvedInput, useSpaceSelector, useSpaceViewSelector } from "../space-editor-provider";
import { ToolbarButton } from "../space-editor-toolbar";
import { useSpaceMediaEdit } from "../space-media-edit-provider";
import toolbarStyles from "../space-editor-tools.module.css";

export function SpaceMediaEditMenu({ nodeId }: { nodeId: string }) {
  const controller = useSpaceMediaEdit();
  return controller ? <SpaceMediaEditMenuContent nodeId={nodeId} /> : null;
}
function SpaceMediaEditMenuContent({ nodeId }: { nodeId: string }) {
  const { session } = useSpaceEditor(), controller = useSpaceMediaEdit(), ko = useLocale() === "ko";
  const node = useSpaceSelector(state => state.nodeById.get(nodeId));
  const writable = useSpaceSelector(state => state.writable && !state.disposed);
  const busy = useSpaceSelector(state => Boolean(state.runtimeByNode.get(nodeId)?.submissionPending || state.runtimeByNode.get(nodeId)?.uploadProgress !== undefined));
  const assetId = useSpaceResolvedInput(nodeId, inputs => {
    const node = session.getSnapshot().nodeById.get(nodeId);
    return node?.kind === "output.single" ? spaceOutputSource(node, inputs)?.assetId ?? null
      : node?.kind === "input.image" || node?.kind === "input.video" ? inputs.sourceAssetIds(nodeId, node.kind.slice(6))[0] ?? null : null;
  });
  const { data: asset } = useMediaAsset(assetId);
  const preview = useSpaceViewSelector(state => state.videoPreviewByNode.get(nodeId));
  const [open, setOpen] = useState(false);
  const [metadata, setMetadata] = useState<{ id: string; width: number; height: number; durationMs: number } | null>(null);
  useEffect(() => {
    if (!open || !asset || asset.type !== "video") return;
    const video = preview?.getVideo();
    if (!video) return;
    const update = () => {
      if (video.readyState >= 1 && video.videoWidth && video.videoHeight && Number.isFinite(video.duration) && video.duration > 0)
        setMetadata({ id: asset.id, width: video.videoWidth, height: video.videoHeight, durationMs: Math.round(video.duration * 1000) });
    };
    update(); video.addEventListener("loadedmetadata", update);
    return () => video.removeEventListener("loadedmetadata", update);
  }, [open, asset, preview]);
  const source = asset && metadata?.id === asset.id && asset.type === "video" ? { ...asset, ...metadata, id: asset.id } : asset;
  if (!controller || !node || !["input.image", "input.video", "output.single"].includes(node.kind) || asset?.type === "audio") return null;
  const disabled = !writable || busy || !asset || asset.status !== "completed" || asset.type === "image" && (!asset.width || !asset.height) || !["image", "video"].includes(asset.type);
  const ready = source && source.width && source.height;
  return <AppDropdownMenu onOpenChange={setOpen}>
    <AppDropdownMenuTrigger asChild disabled={Boolean(disabled)}><ToolbarButton className={toolbarStyles.toolButton} help={ko ? "더보기" : "More"} aria-label={ko ? "더보기" : "More"}
      disabled={Boolean(disabled)} onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}><MoreHorizontal size={16} /></ToolbarButton></AppDropdownMenuTrigger>
    <AppDropdownMenuContent align="end" data-app-overlay-scope="canvas" finalFocus={false}
      onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      {source?.type === "video" && <AppDropdownMenuItem disabled={!ready || !source.durationMs} onClick={() => controller.begin(nodeId, source, "video.trim")}><Scissors size={16} />{ko ? "구간 잘라내기" : "Trim video"}</AppDropdownMenuItem>}
      {source && <AppDropdownMenuItem disabled={!ready} onClick={() => controller.begin(nodeId, source, source.type === "image" ? "image.crop" : "video.crop")}><Crop size={16} />{ko ? source.type === "image" ? "자르기" : "화면 자르기" : source.type === "image" ? "Crop image" : "Crop video"}</AppDropdownMenuItem>}
    </AppDropdownMenuContent>
  </AppDropdownMenu>;
}
