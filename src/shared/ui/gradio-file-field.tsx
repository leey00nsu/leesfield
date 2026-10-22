"use client";
import { AppAudioPlayer } from "./app-audio-player";
import { AppVideoPlayer } from "./app-video-player";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { FileUp, FolderOpen, Loader2, Plus, X, AudioLines, ChevronLeft, ChevronRight } from "lucide-react";
import { MediaAssetPicker } from "@/features/media-assets/ui/media-asset-picker";
import { isAllowedMediaMimeType, type MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { AppButton } from "./app-button";
import { AppMediaActionButton } from "./app-media-action-button";
import { AppMediaOrderBadge } from "./app-media-order-badge";
import { AppAttachmentImagePreview } from "./app-attachment-image-preview";
import { AppAttachmentPreviewLink } from "./app-attachment-preview-link";
import { AppPromptMessage } from "./app-prompt-message";
import { useReferenceAttachmentGroup } from "./generation-reference-attachments";
import { fileFieldAllowsNullItems } from "@/shared/model-catalog/gradio-file-schema";
import { fileFieldMaxItems, gradioInputValues, type GradioContract, type JsonValue } from "@/shared/model-catalog/gradio-contract";
import { fileInputLabel } from "@/shared/model-catalog/file-input-presentation";

import { uploadReferenceFiles, mediaUploadErrorMessage } from "@/shared/api/reference-file-upload";
import { useReferenceUploads } from "./reference-upload-scope";

type FileFieldProps = Parameters<typeof DenseGradioFileField>[0];
export function PairedAudioSection({ field, children }: { field: GradioContract["inputs"][number]; children: ReactNode }) {
  const label = fileInputLabel(field, useLocale());
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    // Let the asset dialog restore focus before revealing the new attachment section.
    const frame = requestAnimationFrame(() => {
      const element = section.current;
      if (!element) return;
      const boundary = element.closest('[data-testid="shared-prompt-form-surface"]') ?? element.parentElement?.parentElement;
      // Bounded forms also have an outer attachment scroller; reveal through both.
      for (let container = element.parentElement; container && container !== boundary; container = container.parentElement) {
        if (!/^(auto|scroll)$/.test(getComputedStyle(container).overflowY) || container.scrollHeight <= container.clientHeight) continue;
        container.scrollTop += element.getBoundingClientRect().top - container.getBoundingClientRect().top;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return <section ref={section} aria-label={label} data-paired-audio-section="" className="flex min-w-0 flex-col gap-3 border-t border-border pt-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    {children}
  </section>;
}
export function GradioFileField(props: FileFieldProps) {
  const locale = useLocale();
  const normalized = { ...props, label: fileInputLabel(props.field, locale) };
  return fileFieldAllowsNullItems(props.field) ? <NullableFileSlots {...normalized}/> : <DenseGradioFileField {...normalized}/>;
}

/** One declared positional slot, independent of a surrounding mixed-reference picker. */
export function GradioFileSlot({ index, ...props }: FileFieldProps & { index: number }) {
  const locale = useLocale();
  const label=fileInputLabel(props.field,locale)+" "+(index+1);
  return <div className="flex min-w-0 flex-col gap-1"><DenseGradioFileField {...props} independent
    field={{...props.field, attachment: undefined, name:props.field.name+"__slot_"+index, kind:"file", required:false, nullable:true, default:null, schema:{type:["string","null"]}}}
    label={label} maxItems={1}/>
    {props.value==null && <AppButton type="button" variant="ghost" size="sm" disabled={props.disabled}
      className="self-start text-xs" aria-label={label+": "+(locale==="ko"?"비우기":"Clear")}
      onClick={()=>props.onChange(null)}>{locale==="ko"?"비우기":"Clear"}</AppButton>}
    </div>;
}

function NullableFileSlots(props: FileFieldProps) {
  const ko=useLocale()==="ko";
  const limit=props.maxItems??fileFieldMaxItems(props.field);
  const items=Array.isArray(props.value)?props.value:[];
  const change=(index:number,value:JsonValue|undefined)=>{
    const next=[...items] as JsonValue[];
    while(next.length<=index)next.push(null);
    next[index]=value??null;
    return props.onChange(next);
  };
  return <div className="flex flex-col gap-3" data-nullable-file-slots="">
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>{props.label}{props.field.required && <span className="ml-2 text-destructive">{ko ? "필수" : "Required"}</span>}</span>
      <span aria-label={ko ? "첨부 개수" : "Attachment count"}>{items.filter(item=>item!==null).length} / {limit}</span>
      <span>{ko?"비워 둔 슬롯의 번호도 유지됩니다.":"Empty slots keep their position."}</span>
    </div>
    {Array.from({length:limit},(_,index)=><DenseGradioFileField key={index} {...props}
      field={{...props.field,name:props.field.name+"__slot_"+index,kind:"file",required:false,nullable:true,default:null,schema:{type:["string","null"]}}}
      label={props.label+" "+(index+1)} value={items[index]??null} maxItems={1} assetPickerTrigger={undefined}
      showAssetPicker={props.showAssetPicker !== false || !!props.onSelectAsset}
      getPreviewUrl={props.getPreviewUrl?value=>props.getPreviewUrl!(value,index):undefined}
      onSelectAsset={props.onSelectAsset?asset=>props.onSelectAsset!(asset,index):undefined}
      onUpload={props.onUpload ? (assets,value)=>{const next=[...items] as JsonValue[];while(next.length<=index)next.push(null);next[index]=value??null;return props.onUpload!(assets,next);} : undefined}
      onChange={value=>change(index,value)}/>)}</div>;
}

function DenseGradioFileField({ label, field, value, onChange, disabled = false, maxItems, previewLabel, getPreviewUrl, showAssetPicker = true, assetPickerTrigger, onSelectAsset, assetSelectable, independent, onChangeOrder, onUpload, captureEditGuard }: {
  label: string;
  field: GradioContract["inputs"][number];
  value: unknown;
  onChange: (value: JsonValue | undefined) => void | Promise<void>;
  onUpload?: (assets: MediaAssetDto[], value: JsonValue | undefined) => void | Promise<void>;
  captureEditGuard?: () => () => boolean;
  disabled?: boolean;
  maxItems?: number;
  previewLabel?: string;
  getPreviewUrl?: (value: string, index: number) => string;
  showAssetPicker?: boolean;
  assetPickerTrigger?: ReactNode;
  assetSelectable?: (asset: MediaAssetDto) => boolean;
  onSelectAsset?: (asset: MediaAssetDto, slotIndex?: number) => void | Promise<void>;
  independent?: boolean;
  onChangeOrder?: (order: number[]) => void | Promise<void>;
}) {
  const groupContext = useReferenceAttachmentGroup();
  const group = independent ? null : groupContext;
  const ko = useLocale() === "ko";
  const input = useRef<HTMLInputElement>(null);
  const assetTrigger = useRef<HTMLButtonElement>(null);
  const [assetContext, setAssetContext] = useState<{name: string; kind: string; media: string | undefined} | null>(null);
  const active = useRef(false);
  const uploads = useReferenceUploads();
  const uploadController = useRef<AbortController | null>(null);
  const releaseUpload = useRef<(() => void) | null>(null);
  const fileIntent = useRef<(() => boolean) | undefined>(undefined), assetIntent = useRef<(() => boolean) | undefined>(undefined);
  const context = useRef({disabled, onChange, onUpload, value, field, maxItems});
  useEffect(() => { context.current = {disabled, onChange, onUpload, value, field, maxItems}; }, [disabled, onChange, onUpload, value, field, maxItems]);
  useEffect(() => { active.current = true; return () => { active.current = false; uploadController.current?.abort(); releaseUpload.current?.(); }; }, []);
  useEffect(() => () => { uploadController.current?.abort(); }, [value, field.name, field.media, field.kind]);
  useEffect(() => { if (disabled) uploadController.current?.abort(); }, [disabled]);
  const [busy, setBusy] = useState(false);
  const reading = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const items = (Array.isArray(value) ? value : value == null ? [] : [value]).filter(Boolean) as string[];
  const multiple = field.kind !== "file";
  const limit = maxItems ?? fileFieldMaxItems(field);
  const countMessage = ko ? `최대 ${limit}개까지 첨부할 수 있습니다.` : `Attach up to ${limit} files.`;
  const canAdd = !busy && !disabled && limit > 0 && (!multiple || items.length < limit);
  if (assetContext && (!showAssetPicker || !canAdd || assetContext.name !== field.name || assetContext.kind !== field.kind || assetContext.media !== field.media)) setAssetContext(null);
  const canSelectAsset = (asset: MediaAssetDto) => {
    if (assetSelectable && !assetSelectable(asset)) return false;
    if (!canAdd || asset.status !== "completed" || (field.media && asset.type !== field.media) || !isAllowedMediaMimeType(asset.type, asset.mimeType) || !asset.url || (multiple && items.includes(asset.url))) return false;
    try {
      gradioInputValues({version:1,apiName:"/authoring",inputs:[field],output:null,diagnostics:[],reviewed:true},
        {dynamicParams:{[field.name]:multiple ? [...items, asset.url] : asset.url}});
      return true;
    } catch { return false; }
  };
  const closeAssets = () => { setAssetContext(null); requestAnimationFrame(() => assetTrigger.current?.focus()); };
  const attachFiles = async (files: File[], guard = captureEditGuard?.()) => {
        if (guard && !guard()) return;
        if (!files.length || disabled || reading.current || limit === 0) return;
        if (files.length + (multiple ? items.length : 0) > limit) { setError(countMessage); return; }
        const originalValue = value;
        const originalField = field.name;
        reading.current = true; setBusy(true); setError(null);
        try {
          const abort = new AbortController(); uploadController.current = abort;
          releaseUpload.current = uploads.begin();
          const assets = await uploadReferenceFiles(files, field.media, abort.signal);
          abort.signal.throwIfAborted();
          const loaded = assets.map(asset => asset.url);
          const current = context.current;
          // Preserve independent option edits, discard replaced/reset attachment context.
          if (!active.current || current.disabled || current.value !== originalValue || current.field.name !== originalField || (guard && !guard())) return;
          const currentLimit = current.maxItems ?? fileFieldMaxItems(current.field);
          if (loaded.length + (multiple ? items.length : 0) > currentLimit) { setError(countMessage); return; }
          const next = multiple ? [...items, ...loaded] : loaded[0];
          if (current.onUpload) await current.onUpload(assets, next); else await current.onChange(next);
          setNames(previous => ({...previous, ...Object.fromEntries(loaded.map((url, index) => [url, files[index].name]))}));
        } catch (error) { if (active.current && !uploadController.current?.signal.aborted) setError(mediaUploadErrorMessage(error, ko)); }
        finally { releaseUpload.current?.(); releaseUpload.current = null; uploadController.current = null; reading.current = false; if (active.current) setBusy(false); }
  };

  const selectAsset = (asset:MediaAssetDto, guard = assetIntent.current) => {
    if (!active.current || !canSelectAsset(asset) || (guard && !guard())) return;
    setError(null);
    return onSelectAsset ? onSelectAsset(asset) : onChange(multiple ? [...items,asset.url] : asset.url);
  };
  useEffect(()=>{group?.register({field,items,limit,busy,canAdd,attachFiles,canSelectAsset,selectAsset,captureEditGuard});});
  useEffect(()=>()=>{group?.unregister(field.name);},[group,field.name]);
  return <div className="flex min-w-0 flex-col gap-3" data-attachment-field="">
    <input ref={input} type="file" className="sr-only" tabIndex={-1}
      data-paired-file-slot={independent ? "true" : undefined}
      aria-label={label} aria-required={field.required}
      multiple={multiple && limit > 1} accept={field.media ? field.media + "/*" : "image/*,audio/*,video/*"}
      disabled={busy || disabled || limit === 0}
      onClick={() => { fileIntent.current = captureEditGuard?.(); }}
      onChange={event=>{const files=Array.from(event.target.files??[]);event.target.value="";const guard=fileIntent.current;fileIntent.current=undefined;void attachFiles(files,guard);}} />
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {!group && <AppMediaActionButton
        disabled={busy || disabled || limit === 0 || (multiple && items.length >= limit)}
        onClick={() => input.current?.click()}
        aria-label={label + ": " + (items.length && !multiple ? (ko ? "파일 교체" : "Replace file") : (ko ? "파일 업로드" : "Upload file"))}
       >
        {busy ? <Loader2 className="size-4 animate-spin"/> : <Plus className="size-4"/>}
        {ko ? "업로드" : "Upload"}
      </AppMediaActionButton>}
      {!group && showAssetPicker && <AppMediaActionButton ref={assetTrigger}
        disabled={!canAdd}
        aria-label={label + ": " + (ko ? "에셋 선택" : "Choose asset")}
        onClick={() => { assetIntent.current=captureEditGuard?.(); setAssetContext({name:field.name,kind:field.kind,media:field.media}); }}>
        <FolderOpen className="size-4"/>{ko ? "에셋" : "Assets"}
      </AppMediaActionButton>}
      {!group && assetPickerTrigger}
      <span className="text-xs text-muted-foreground">{label}{field.required && <span className="ml-2 text-destructive">{ko ? "필수" : "Required"}</span>}</span>
      {limit > 0 && <span className="text-xs text-muted-foreground" aria-label={ko ? "첨부 개수" : "Attachment count"}>{items.length} / {limit}</span>}
    </div>
    {items.length > 0 && <div className="flex flex-wrap gap-2" data-attachment-previews="">
      {items.map((url, index) => {
        const previewUrl = getPreviewUrl?.(url, index) ?? url;
        const preview = previewUrl.startsWith("data:image/") || (field.media === "image" && /^(https?:\/\/|\/(?!\/))/.test(previewUrl));
        const name = names[url] ?? label;
        return <div key={index + ":" + url}>
        <div className="group relative flex size-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-background/30" title={name}>
          {preview ? (
            <AppAttachmentImagePreview src={previewUrl} alt={previewLabel ?? label}/>
          ) : field.media === "video" || field.media === "audio" ? <AttachmentMediaPreview key={previewUrl} src={previewUrl} media={field.media} label={name}/> : <div className="flex min-w-0 flex-col items-center px-1"><FileUp className="size-5 text-muted-foreground"/><span className="max-w-full truncate text-[10px]">{name}</span></div>}
          <AppMediaOrderBadge order={index + 1} />
          <AppButton type="button" variant="surface" size="icon-sm" disabled={disabled || busy}
            className="absolute right-0.5 top-0.5 size-5 rounded-full bg-black/70 text-white"
            aria-label={ko ? "제거" : "Remove"} title={(ko ? "제거" : "Remove") + ": " + name}
            onClick={() => {
              if (onChangeOrder) { void onChangeOrder(items.map((_,position)=>position).filter(position=>position!==index)); setError(null); return; }
              const next = items.filter((_, position) => position !== index);
              onChange(next.length ? (multiple || Array.isArray(value) ? next : next[0]) : field.nullable ? null : undefined);
              setError(null);
            }}><X className="size-3"/></AppButton>
        </div>
        {onChangeOrder && <div className="flex gap-1">
          {([-1,1] as const).map(direction=><AppButton key={direction} type="button" variant="ghost" size="icon-sm"
            disabled={disabled || busy || index+direction<0 || index+direction>=items.length}
            aria-label={label+" "+(index+1)+": "+(direction<0?(ko?"앞으로 이동":"Move earlier"):(ko?"뒤로 이동":"Move later"))}
            onClick={()=>{const order=items.map((_,position)=>position);[order[index],order[index+direction]]=[order[index+direction],order[index]];void onChangeOrder(order);}}>
            {direction<0?<ChevronLeft className="size-3"/>:<ChevronRight className="size-3"/>}
          </AppButton>)}
        </div>}
        </div>;
      })}
    </div>}
    {error && <AppPromptMessage>{error}</AppPromptMessage>}
    {!group && showAssetPicker && assetContext && canAdd && assetContext.name === field.name && assetContext.kind === field.kind && assetContext.media === field.media &&
      <MediaAssetPicker open mediaType={field.media} selectedUrls={items} writable={canAdd}
        canSelectAsset={canSelectAsset} onOpenChange={open => { if (!open) closeAssets(); }}
        onSelect={asset => {
          if (!active.current || !canSelectAsset(asset)) return;
          void selectAsset(asset); closeAssets();
        }}/>}
  </div>;
}

function AttachmentMediaPreview({src,media,label}:{src:string;media:"video"|"audio";label:string}) {
  const element = useRef<HTMLMediaElement>(null);
  const active = useRef(false), mounted = useRef(true);
  const playbackRequest = useRef(0);
  const [playing,setPlaying] = useState(false), [failedSource,setFailedSource] = useState<string | null>(null);
  const stop = () => {
    const wasActive = active.current;
    active.current = false;
    playbackRequest.current++;
    if (element.current && (wasActive || !element.current.paused)) element.current.pause();
  };
  const start = async () => {
    const player = element.current;
    if (!src || failedSource === src || active.current || !player || document.hidden) return;
    active.current = true;
    const request = ++playbackRequest.current;
    try {
      await player.play();
      if (!mounted.current || !active.current || document.hidden) player.pause();
    } catch {
      // Autoplay denials and interrupted playback may be retried on the next hover.
      if (mounted.current && playbackRequest.current === request) { active.current = false; setPlaying(false); }
    }
  };
  useEffect(() => {
    const player = element.current;
    mounted.current = true;
    const hidden = () => { if (document.hidden) {
      if (active.current || (player && !player.paused)) player?.pause();
      active.current = false; playbackRequest.current++;
    } };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      mounted.current = false;
      if (active.current || (player && !player.paused)) player?.pause();
      active.current = false;
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  const props = {src:src||undefined,preload:"metadata" as const,onPlay:()=>setPlaying(true),onPause:()=>setPlaying(false),onEnded:()=>setPlaying(false),onError:()=>setFailedSource(src)};
  return <AppAttachmentPreviewLink src={src} label={label} className="flex size-full items-center justify-center"
    onPointerEnter={event => { if (event.pointerType !== "touch") void start(); }} onPointerLeave={stop}
    onFocus={() => { void start(); }} onBlur={stop} onClick={stop}>
    {media === "video" ? <AppVideoPlayer {...props} src={src ?? ""} controls={false} ref={element as React.RefObject<HTMLVideoElement>} muted loop playsInline className="size-full object-cover"/>
      : <><AppAudioPlayer {...props} src={src ?? ""} controls={false} ref={element as React.RefObject<HTMLAudioElement>} className="hidden"/><AudioLines data-playing={playing} className="size-6 text-muted-foreground data-[playing=true]:text-foreground"/></>}
  </AppAttachmentPreviewLink>;
}
