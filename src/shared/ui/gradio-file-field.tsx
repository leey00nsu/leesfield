"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { FileUp, Loader2, Plus, X } from "lucide-react";
import { AppButton } from "./app-button";
import { AppMediaOrderBadge } from "./app-media-order-badge";
import { AppPromptMessage } from "./app-prompt-message";
import { fileFieldMaxItems, type GradioContract, type JsonValue } from "@/shared/model-catalog/gradio-contract";

export function GradioFileField({ label, field, value, onChange, disabled = false, maxItems, buttonLabel, previewLabel, description, getPreviewUrl }: {
  label: string;
  field: GradioContract["inputs"][number];
  value: unknown;
  onChange: (value: JsonValue | undefined) => void;
  disabled?: boolean;
  maxItems?: number;
  buttonLabel?: string;
  previewLabel?: string;
  description?: ReactNode;
  getPreviewUrl?: (value: string, index: number) => string;
}) {
  const ko = useLocale() === "ko";
  const input = useRef<HTMLInputElement>(null);
  const active = useRef(false);
  const context = useRef({disabled, onChange, value, field, maxItems});
  useEffect(() => { context.current = {disabled, onChange, value, field, maxItems}; }, [disabled, onChange, value, field, maxItems]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [busy, setBusy] = useState(false);
  const reading = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const items = (Array.isArray(value) ? value : value == null ? [] : [value]).filter(Boolean) as string[];
  const multiple = field.kind !== "file";
  const limit = maxItems ?? fileFieldMaxItems(field);
  const countMessage = ko ? `최대 ${limit}개까지 첨부할 수 있습니다.` : `Attach up to ${limit} files.`;
  return <div className="flex min-w-0 flex-col gap-3" data-attachment-field="">
    <input ref={input} type="file" className="sr-only" tabIndex={-1}
      aria-label={label} aria-required={field.required}
      multiple={multiple && limit > 1} accept={field.media ? field.media + "/*" : "image/*,audio/*,video/*"}
      disabled={busy || disabled || limit === 0}
      onChange={async event => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        if (!files.length || disabled || reading.current || limit === 0) return;
        if (files.length + (multiple ? items.length : 0) > limit) { setError(countMessage); return; }
        const originalValue = value;
        const originalField = field.name;
        reading.current = true; setBusy(true); setError(null);
        try {
          const loaded = await Promise.all(files.map(file => new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          })));
          const current = context.current;
          // Preserve independent option edits, discard replaced/reset attachment context.
          if (!active.current || current.disabled || current.value !== originalValue || current.field.name !== originalField) return;
          const currentLimit = current.maxItems ?? fileFieldMaxItems(current.field);
          if (loaded.length + (multiple ? items.length : 0) > currentLimit) { setError(countMessage); return; }
          current.onChange(multiple ? [...items, ...loaded] : loaded[0]);
          setNames(previous => ({...previous, ...Object.fromEntries(loaded.map((url, index) => [url, files[index].name]))}));
        } catch { if (active.current) setError(ko ? "파일을 읽지 못했습니다. 다시 선택해 주세요." : "Could not read the file. Please select it again."); }
        finally { reading.current = false; if (active.current) setBusy(false); }
      }} />
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <AppButton type="button" variant="surface-muted" size="pill-sm"
        disabled={busy || disabled || limit === 0 || (multiple && items.length >= limit)}
        onClick={() => input.current?.click()}
        aria-label={buttonLabel ?? label + ": " + (items.length && !multiple ? (ko ? "파일 교체" : "Replace file") : (ko ? "파일 추가" : "Add file"))}
        className="rounded-full px-3">
        {busy ? <Loader2 className="size-4 animate-spin"/> : <Plus className="size-4"/>}
        {ko ? "첨부" : "Attach"}
      </AppButton>
      {description}
      {limit > 0 && <span className="text-xs text-muted-foreground" aria-label={ko ? "첨부 개수" : "Attachment count"}>{items.length} / {limit}</span>}
    </div>
    {items.length > 0 && <div className="flex flex-wrap gap-2" data-attachment-previews="">
      {items.map((url, index) => {
        const previewUrl = getPreviewUrl?.(url, index) ?? url;
        const preview = previewUrl.startsWith("data:image/") || (field.media === "image" && /^(https?:\/\/|\/(?!\/))/.test(previewUrl));
        const name = names[url] ?? label;
        return <div key={index + ":" + url} className="group relative flex size-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-background/30" title={name}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={previewLabel ?? label} className="size-full object-cover"/>
          ) : field.media === "video" ? <video src={previewUrl} muted preload="metadata" aria-label={name} className="size-full object-cover"/> : <div className="flex min-w-0 flex-col items-center px-1"><FileUp className="size-5 text-muted-foreground"/><span className="max-w-full truncate text-[10px]">{name}</span></div>}
          <AppMediaOrderBadge order={index + 1} />
          <AppButton type="button" variant="surface" size="icon-sm" disabled={disabled || busy}
            className="absolute right-0.5 top-0.5 size-5 rounded-full bg-black/70 text-white"
            aria-label={ko ? "제거" : "Remove"} title={(ko ? "제거" : "Remove") + ": " + name}
            onClick={() => {
              const next = items.filter((_, position) => position !== index);
              onChange(next.length ? (multiple || Array.isArray(value) ? next : next[0]) : field.nullable ? null : undefined);
              setError(null);
            }}><X className="size-3"/></AppButton>
        </div>;
      })}
    </div>}
    {error && <AppPromptMessage>{error}</AppPromptMessage>}
  </div>;
}
