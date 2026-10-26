"use client";

import { AppPreviewImage } from "@/shared/ui/app-preview-image";
import { AppVideoPlayer } from "@/shared/ui/app-video-player";
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowUp, Check, ChevronDown, X } from "lucide-react";
import { useLocale } from "next-intl";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import type { DirectEdit } from "@/shared/media-assets/direct-media-edit";
import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger } from "@/shared/ui/app-dropdown-menu";
import { adjustCrop, cropPresets, presetCrop, type CropHandle } from "../../model/media-crop-geometry";
import styles from "./media-edit.module.css";

export type CropEdit = Exclude<DirectEdit, { kind: "video.trim" }>;
export type CropEditorProps = {
  asset: MediaAssetDto; edit: CropEdit; preset: string; onChange: (edit: CropEdit, preset?: string) => void;
  onCancel: () => void; onConfirm: () => void; stageStyle?: CSSProperties; barStyle?: CSSProperties;
};
const handles: Exclude<CropHandle, "move">[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export function MediaCropEditor({ asset, edit, preset, onChange, onCancel, onConfirm, stageStyle, barStyle }: CropEditorProps) {
  const ko = useLocale() === "ko", video = edit.kind === "video.crop", root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; handle: CropHandle; x: number; y: number; scale: number; rect: CropEdit["rect"] } | null>(null);
  const { rect } = edit, width = asset.width!, height = asset.height!;
  const label = (en: string, kr: string) => ko ? kr : en;
  const escape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.nativeEvent.isComposing || event.keyCode === 229
      || event.target instanceof Element && event.target.closest('[role="menu"][data-open],[role="dialog"]')) return;
    event.preventDefault(); event.stopPropagation(); onCancel();
  };
  useEffect(() => { root.current?.focus({ preventScroll: true }); }, []);
  const key = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing || event.keyCode === 229 || event.altKey) return;
    if (event.key === "Escape") { event.preventDefault(); onCancel(); }
    else if (event.key === "Enter" && !(event.target instanceof Element && event.target.closest("button,select,[role=menu]"))) { event.preventDefault(); onConfirm(); }
    else if (event.key.startsWith("Arrow") && event.target instanceof Element && !event.target.closest("button,select,[role=menu]")) {
      event.preventDefault();
      const handle = (event.target.getAttribute("data-crop-handle") ?? "move") as CropHandle;
      const step = event.shiftKey ? 10 : video ? 2 : 1;
      onChange({ ...edit, rect: adjustCrop(rect, handle, event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
        event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0, width, height, video) });
    }
  };
  const start = (event: PointerEvent<HTMLDivElement>, handle: CropHandle) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
    const stage = root.current!.getBoundingClientRect();
    drag.current = { pointer: event.pointerId, handle, x: event.clientX, y: event.clientY, rect, scale: stage.width / width };
  };
  return <>
    <div ref={root} className={styles.cropStage} style={stageStyle} tabIndex={0} role="group"
      aria-label={label(video ? "Crop video" : "Crop image", video ? "화면 자르기" : "이미지 자르기")}
      data-media-crop={video ? "video" : "image"} onKeyDown={key} onKeyDownCapture={escape}
      onPointerMove={event => {
        const d = drag.current;
        if (d && d.pointer === event.pointerId && d.scale > 0) {
          event.preventDefault(); event.stopPropagation();
          onChange({ ...edit, rect: adjustCrop(d.rect, d.handle, (event.clientX - d.x) / d.scale, (event.clientY - d.y) / d.scale, width, height, video) });
        }
      }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }} onPointerDown={event => event.stopPropagation()}>
      {video ? <AppVideoPlayer src={asset.url} controls={false} inlineOnly muted playsInline preload="metadata" className={styles.original} aria-label={label("Original video", "원본 영상")} />
        : <AppPreviewImage src={asset.url} alt={label("Original image", "원본 이미지")} className={styles.original} draggable={false} />}
      <div className={styles.cropRect} style={{ left: rect.x / width * 100 + "%", top: rect.y / height * 100 + "%",
        width: rect.width / width * 100 + "%", height: rect.height / height * 100 + "%" }}
        tabIndex={0} data-crop-handle="move" role="group" aria-label={label("Move crop selection", "자르기 영역 이동")}
        onPointerDown={event => start(event, "move")}>
        <div className={styles.grid} aria-hidden="true" />
        {handles.map(handle => <div key={handle} tabIndex={0} role="slider" aria-label={label("Crop handle " + handle, "자르기 조절점 " + handle)}
          aria-valuemin={0} aria-valuemax={handle === "n" || handle === "s" ? height : width}
          aria-valuenow={handle === "n" ? rect.y : handle === "s" ? rect.y + rect.height : handle.includes("w") ? rect.x : rect.x + rect.width}
          aria-valuetext={rect.width + " × " + rect.height} data-crop-handle={handle}
          className={styles.handle} onPointerDown={event => start(event, handle)} />)}
      </div>
    </div>
    <div className={styles.cropBar} style={barStyle} role="toolbar" aria-label={label("Crop controls", "자르기 도구")}
      onKeyDown={key} onKeyDownCapture={escape} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      <button type="button" aria-label={label("Cancel editing", "편집 취소")} title="Esc" onClick={onCancel}><X size={18} /></button>
      <span className={styles.divider} />
      {video ? <output className={styles.dimensions} aria-live="polite">{rect.width} × {rect.height}</output> :
        <AppDropdownMenu>
          <AppDropdownMenuTrigger asChild><button type="button" className={styles.ratio} aria-label={label("Aspect ratio", "비율")}>
            {preset === "original" ? label("Original", "원본") : preset === "custom" ? label("Custom", "사용자 지정") : preset}<ChevronDown size={14} />
          </button></AppDropdownMenuTrigger>
          <AppDropdownMenuContent data-app-overlay-scope="canvas" onKeyDown={event => event.stopPropagation()}>
            {cropPresets.map(value => <AppDropdownMenuItem key={value} onClick={() => onChange({ ...edit, rect: presetCrop(width, height, value) }, value)}>
              <span className={styles.presetShape} style={{ aspectRatio: value === "original" ? width / height : value.replace(":", "/") }} />
              {value === "original" ? label("Original", "원본") : value}{preset === value && <Check size={14} className={styles.presetCheck} />}
            </AppDropdownMenuItem>)}
            {preset === "custom" && <AppDropdownMenuItem disabled>{label("Custom", "사용자 지정")}</AppDropdownMenuItem>}
          </AppDropdownMenuContent>
        </AppDropdownMenu>}
      <span className={styles.divider} />
      <button type="button" className={video ? styles.create : styles.confirm} aria-label={label(video ? "Create cropped video" : "Confirm crop", video ? "잘라낸 영상 생성" : "자르기 확인")}
        title={video ? undefined : label("Animated images become a still PNG", "애니메이션 이미지는 첫 프레임의 정지 PNG로 저장됩니다")} onClick={onConfirm}>
        {video ? <>{label("Create", "생성")}<ArrowUp size={16} /></> : <Check size={18} />}
      </button>
    </div>
  </>;
}
