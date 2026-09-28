"use client";

import { createContext, useContext, type ReactNode } from "react";

const LocalizationContext = createContext<(text: string) => string>((text) => text);

export function CanvasLocalizationProvider({ translate, children }: { translate: (text: string) => string; children: ReactNode }) {
  return <LocalizationContext.Provider value={translate}>{children}</LocalizationContext.Provider>;
}

export function useCanvasTranslation() {
  return useContext(LocalizationContext);
}
