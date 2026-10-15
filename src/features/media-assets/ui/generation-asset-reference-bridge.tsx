"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useGenerationSearchParams } from "@/shared/lib/generation/query-context";
import type { GradioField, JsonValue } from "@/shared/model-catalog/gradio-contract";
import { fileInputLabel } from "@/shared/model-catalog/file-input-presentation";
import { AppButton } from "@/shared/ui/app-button";
import { useMediaAsset } from "../hook/use-media-assets";
import { assetReferenceValue } from "../lib/asset-reference-authoring";
import { assetSelectClass } from "./asset-organization-filters";

export function GenerationAssetReferenceBridge({ fields, values, onAttach, disabled }: {
  fields: GradioField[]; values: Record<string, unknown>; onAttach: (field: string, value: JsonValue) => void; disabled: boolean;
}) {
  const query = useGenerationSearchParams(), t = useTranslations("assets"), locale = useLocale();
  const id = query.get("assetId");
  const asset = useMediaAsset(id);
  const [selected, setSelected] = useState("");
  const [dismissed, setDismissed] = useState<string | null>(null);
  const choices = asset.data ? fields.filter(field => assetReferenceValue(field, values[field.name], asset.data!) !== undefined) : [];
  const chosen = choices.find(field => field.name === selected) ?? choices[0];
  if (!id || dismissed === id) return null;
  return <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3" data-asset-reference-bridge="">
    <p className="min-w-0 flex-1 truncate text-xs" title={asset.data?.name}>{asset.data?.name ?? t(asset.isLoading ? "loading" : asset.isError ? "error" : "referencePending")}</p>
    {!asset.isLoading && !asset.isError && !choices.length && <p className="w-full text-xs text-muted-foreground">{t("noInput")}</p>}
    {!!choices.length && <><select className={assetSelectClass} aria-label={t("references")} value={chosen?.name ?? ""} disabled={disabled} onChange={event => setSelected(event.target.value)}>{choices.map(field => <option key={field.name} value={field.name}>{fileInputLabel(field, locale)}</option>)}</select><AppButton size="sm" type="button" disabled={disabled || !chosen} onClick={() => {
      if (disabled || !chosen || !asset.data) return;
      const value = assetReferenceValue(chosen, values[chosen.name], asset.data);
      if (value === undefined) return;
      onAttach(chosen.name, value); setDismissed(id);
    }}>{t("attach")}</AppButton></>}
    {asset.isError && <AppButton size="sm" variant="ghost" type="button" onClick={() => void asset.refetch()}>{t("retry")}</AppButton>}
    <AppButton size="sm" variant="ghost" type="button" onClick={() => setDismissed(id)}>{t("close")}</AppButton>
  </div>;
}
