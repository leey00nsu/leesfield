"use client";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AppFilterPanel } from "@/shared/ui/app-filter-panel";
export function ModelFilterGroup({ children }: { children: ReactNode }) {
  const t = useTranslations("model.filters");
  return <AppFilterPanel title={t("title")} description={t("description")} applyLabel={t("apply")}>{children}</AppFilterPanel>;
}
