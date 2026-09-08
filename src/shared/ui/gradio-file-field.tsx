"use client";
import { useRef, useState } from "react";
import { useLocale } from "next-intl";
import { FileUp, Loader2, X } from "lucide-react";
import { AppButton } from "./app-button";
import type { GradioContract, JsonValue } from "@/shared/model-catalog/gradio-contract";

export function GradioFileField({ label, field, value, onChange }: {
  label: string;
  field: GradioContract["inputs"][number];
  value: unknown;
  onChange: (value: JsonValue | undefined) => void;
}) {
  const ko = useLocale() === "ko";
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const items = (Array.isArray(value) ? value : value == null ? [] : [value]).filter(Boolean);
  const first = items[0];
  const preview = typeof first === "string" && (first.startsWith("data:image/") || (field.media === "image" && /^https?:\/\//.test(first))) ? first : undefined;
  return <div className="min-w-0">
    <input ref={input} type="file" className="sr-only" tabIndex={-1}
      aria-label={label} aria-required={field.required}
      multiple={field.kind !== "file"} accept={field.media ? field.media + "/*" : "image/*,audio/*,video/*"}
      disabled={busy}
      onChange={async event => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        if (!files.length) return;
        setBusy(true); setError(false);
        try {
          const loaded = await Promise.all(files.map(file => new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          })));
          onChange(field.kind === "file" ? loaded[0] : loaded);
          setNames(files.map(file => file.name));
        } catch { setError(true); } finally { setBusy(false); }
      }} />
    <div className="relative">
      <button type="button" disabled={busy} onClick={() => input.current?.click()}
        aria-label={label + ": " + (items.length ? (ko ? "파일 교체" : "Replace file") : (ko ? "파일 추가" : "Add file"))}
        className="flex h-24 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed border-border bg-background/30 px-3 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
        {busy ? <Loader2 className="size-5 animate-spin" /> : preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={label} className="h-12 w-full object-contain" />
        ) : <FileUp className="size-5" />}
        <span className="w-full truncate text-center">{busy ? (ko ? "파일 읽는 중" : "Reading file") : items.length ? (names.length ? names.join(", ") : (ko ? "첨부 파일" : "Attached file") + (items.length > 1 ? " · " + items.length : "")) : (ko ? "파일 추가" : "Add file")}</span>
      </button>
      {items.length > 0 && !busy && <AppButton type="button" variant="surface" size="icon-sm"
        className="absolute right-1 top-1 size-6" aria-label={ko ? "제거" : "Remove"}
        onClick={() => { onChange(field.nullable ? null : undefined); setNames([]); setError(false); }}>
        <X className="size-3" />
      </AppButton>}
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{ko ? "파일을 읽지 못했습니다. 다시 선택해 주세요." : "Could not read the file. Please select it again."}</p>}
  </div>;
}
