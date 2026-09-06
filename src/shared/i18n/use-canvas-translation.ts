"use client";

import { useCallback } from "react";
import { useLocale } from "next-intl";
import korean from "./canvas-ko.json";

/** Translate UI copy only; never pass model identifiers or user-authored content. */
export function useCanvasTranslation() {
  const locale = useLocale();
  return useCallback((text: string): string =>
    locale === "ko" && Object.hasOwn(korean, text) ? (korean as Record<string, string>)[text] : text, [locale]);
}
