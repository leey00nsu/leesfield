"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { AppSortSelect } from "./app-filter-toolbar";

export type MediaPreviewFit = "cover" | "contain";
const key = "leesfield.media-preview-fit";
const changed = "leesfield:media-preview-fit";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changed, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(changed, callback); };
}
function snapshot(): MediaPreviewFit {
  try { return window.localStorage.getItem(key) === "contain" ? "contain" : "cover"; }
  catch { return "cover"; }
}
const serverSnapshot = (): MediaPreviewFit => "cover";
export function useMediaPreviewFit() {
  const fit = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const setFit = (value: MediaPreviewFit) => {
    try { window.localStorage.setItem(key, value); } catch { return; }
    window.dispatchEvent(new Event(changed));
  };
  return [fit, setFit] as const;
}
export function AppMediaFitControl({ value, onChange }: { value: MediaPreviewFit; onChange: (value: MediaPreviewFit) => void }) {
  const t = useTranslations("common.listControls");
  return <AppSortSelect ariaLabel={t("previewFit")} className="w-32" value={value} onValueChange={value => onChange(value as MediaPreviewFit)} options={[{ value: "cover", label: t("fill") }, { value: "contain", label: t("fit") }]} />;
}
