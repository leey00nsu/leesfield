"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { FolderOpen, Loader2, Plus } from "lucide-react";
import { MediaAssetPicker } from "@/features/media-assets/ui/media-asset-picker";
import { fileFieldAllowsNullItems } from "@/shared/model-catalog/gradio-file-schema";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { droppedMediaType, normalizeDroppedMediaFile } from "@/shared/media-assets/media-file-drop";
import type { GradioField } from "@/shared/model-catalog/gradio-contract";
import { AppButton } from "./app-button";
import { AppPromptMessage } from "./app-prompt-message";

export interface ReferenceAttachmentControl {
  field: GradioField;
  items: string[];
  limit: number;
  busy: boolean;
  canAdd: boolean;
  attachFiles: (files: File[]) => Promise<void>;
  canSelectAsset: (asset: MediaAssetDto) => boolean;
  selectAsset: (asset: MediaAssetDto) => void | Promise<void>;
}

const ReferenceContext = createContext<{
  register: (control: ReferenceAttachmentControl) => void;
  unregister: (name: string) => void;
} | null>(null);
export const useReferenceAttachmentGroup = () => useContext(ReferenceContext);

/** Same-media roles (e.g. start/end frame) remain separate, explicitly named slots. */
export function canGroupReferences(fields: GradioField[]) {
  return fields.length > 1 && fields.every(field => !fileFieldAllowsNullItems(field) && field.media && !field.choices?.length && ["file","files","gallery"].includes(field.kind))
    && new Set(fields.map(field=>field.media)).size === fields.length;
}

export function GenerationReferenceAttachments({fields, disabled = false, requirement, children}: {
  fields: GradioField[]; disabled?: boolean; requirement?: ReactNode; children: ReactNode;
}) {
  const ko = useLocale() === "ko";
  const controls = useRef(new Map<string,ReferenceAttachmentControl>());
  type Summary = {name:string;busy:boolean;canAdd:boolean;limit:number;items:string[]};
  const [snapshot, setSnapshot] = useState<Summary[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const notify = useCallback(() => {
    // Retain URL references; never serialize potentially large data URLs during rendering.
    const next = [...controls.current.values()].map(control=>({name:control.field.name,busy:control.busy,canAdd:control.canAdd,limit:control.limit,items:control.items}));
    setSnapshot(previous=>previous.length === next.length && previous.every((item,index)=>{
      const current=next[index];
      return item.name === current.name && item.busy === current.busy && item.canAdd === current.canAdd && item.limit === current.limit
        && item.items.length === current.items.length && item.items.every((url,index)=>url === current.items[index]);
    }) ? previous : next);
  }, []);
  const register = useCallback((control:ReferenceAttachmentControl) => {controls.current.set(control.field.name,control);notify();}, [notify]);
  const unregister = useCallback((name:string)=>{controls.current.delete(name);notify();}, [notify]);
  const context = useMemo(()=>({register,unregister}),[register,unregister]);
  // Summary is a render snapshot; handlers use the current controllers instead.
  const busy = snapshot.some(control=>control.busy);
  const canAdd = !disabled && !busy && snapshot.some(control=>control.canAdd);
  const key = fields.map(field=>field.name+":"+field.kind+":"+field.media).join("|");
  const close = () => {setOpenKey(null);requestAnimationFrame(()=>trigger.current?.focus());};
  if (openKey && (!canAdd || openKey !== key)) setOpenKey(null);
  if (!canGroupReferences(fields)) return children;
  const controlFor = (asset:MediaAssetDto) => [...controls.current.values()].find(control=>control.field.media === asset.type && control.canSelectAsset(asset));
  return <ReferenceContext.Provider value={context}>
    <div className="flex min-w-0 flex-col gap-3" data-reference-attachments="">
      <input ref={input} type="file" className="sr-only" tabIndex={-1} multiple
        aria-label={ko ? "참조 자료 첨부" : "Attach references"}
        accept={fields.map(field=>field.media+"/*").join(",")} disabled={!canAdd}
        onChange={async event=>{
          const original=Array.from(event.target.files??[]);event.target.value="";
          if (!canAdd || !original.length) return;
          const batch=new Map<ReferenceAttachmentControl,File[]>();
          for (const file of original) {
            const normalized=normalizeDroppedMediaFile(file);
            const control=normalized && [...controls.current.values()].find(control=>control.field.media === droppedMediaType(normalized.type));
            if (!normalized || !control?.canAdd) {setError(ko ? "현재 모델이 지원하는 참조 자료를 선택해 주세요." : "Select references supported by the current model.");return;}
            batch.set(control,[...(batch.get(control)??[]),normalized]);
          }
          for (const [control,files] of batch) {
            if (files.length+(control.field.kind === "file" ? 0 : control.items.length)>control.limit) {
              setError(ko ? `최대 ${control.limit}개까지 첨부할 수 있습니다.` : `Attach up to ${control.limit} files.`);return;
            }
          }
          setError(null);
          await Promise.all([...batch].map(([control,files])=>control.attachFiles(files)));
        }}/>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <AppButton type="button" variant="surface-muted" size="pill-sm" className="rounded-full px-3" disabled={!canAdd}
          aria-label={ko ? "참조 자료 첨부" : "Attach references"} onClick={()=>input.current?.click()}>
          {busy ? <Loader2 className="size-4 animate-spin"/> : <Plus className="size-4"/>}{ko ? "첨부" : "Attach"}
        </AppButton>
        <AppButton ref={trigger} type="button" variant="surface-muted" size="pill-sm" className="rounded-full px-3" disabled={!canAdd}
          aria-label={ko ? "참조 자료 에셋 선택" : "Choose reference assets"} onClick={()=>setOpenKey(key)}>
          <FolderOpen className="size-4"/>{ko ? "에셋" : "Assets"}
        </AppButton>
        <span className="text-xs text-muted-foreground">{ko ? "참조 자료" : "References"}</span>
      </div>
      {requirement && <span className="text-xs text-muted-foreground">{requirement}</span>}
      {children}
      {error && <AppPromptMessage>{error}</AppPromptMessage>}
    </div>
    {openKey === key && canAdd && <MediaAssetPicker open writable selectedUrls={snapshot.flatMap(control=>control.items)}
      canSelectAsset={asset=>!!controlFor(asset)} onOpenChange={open=>{if(!open)close();}}
      onSelect={asset=>{const control=controlFor(asset);if(disabled||!control)return;void control.selectAsset(asset);close();}}/>}
  </ReferenceContext.Provider>;
}

