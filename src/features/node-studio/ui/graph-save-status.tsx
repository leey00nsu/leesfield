"use client";

import { AlertTriangle, Check, LoaderCircle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppButton } from "@/shared/ui/app-button";

import type { GraphAutosaveStatus } from "../hook/use-graph-autosave";

type GraphSaveStatusProps = {
  status: GraphAutosaveStatus;
  version: number;
  onRetry: () => void;
  onReloadLatest: () => void;
};

export function GraphSaveStatus({
  status,
  version,
  onRetry,
  onReloadLatest,
}: GraphSaveStatusProps) {
  const t = useTranslations("nodeStudio");
  const isPersistent = status === "error" || status === "conflict";
  const Icon = status === "saved" ? Check : status === "error" || status === "conflict" ? AlertTriangle : LoaderCircle;

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-2 text-xs ${
        isPersistent ? "border-amber-300/25 bg-amber-400/8 text-amber-100" : "border-white/10 bg-black/20 text-white/55"
      }`}
      role={isPersistent ? "alert" : "status"}
      aria-live="polite"
    >
      <Icon className={`h-4 w-4 ${status === "saving" ? "animate-spin" : ""}`} aria-hidden="true" />
      <span>{t(`save.${status}`)}</span>
      <span className="text-white/35">v{version}</span>
      {status === "error" ? (
        <AppButton type="button" size="pill-sm" variant="surface" onClick={onRetry}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          {t("actions.retry")}
        </AppButton>
      ) : null}
      {status === "conflict" ? (
        <AppButton type="button" size="pill-sm" variant="surface" onClick={onReloadLatest}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          {t("actions.reloadLatest")}
        </AppButton>
      ) : null}
    </div>
  );
}
