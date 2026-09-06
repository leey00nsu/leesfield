"use client";

import type { ReactNode } from "react";
import { CanvasLocalizationProvider } from "@node-banana-runtime/localization";
import { useCanvasTranslation } from "./use-canvas-translation";

export function AppCanvasLocalizationProvider({ children }: { children: ReactNode }) {
  const translate = useCanvasTranslation();
  return <CanvasLocalizationProvider translate={translate}>{children}</CanvasLocalizationProvider>;
}
