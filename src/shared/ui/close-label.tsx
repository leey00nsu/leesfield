"use client";
import { createContext, useContext, type ReactNode } from "react";
import { useTranslations } from "next-intl";
const CloseLabelContext = createContext("Close");
export function CloseLabelProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("common.actions");
  return <CloseLabelContext value={t("close")}>{children}</CloseLabelContext>;
}
export function CloseLabel() { return useContext(CloseLabelContext); }
