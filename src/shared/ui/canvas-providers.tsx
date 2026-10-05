"use client";
import type { ReactNode } from "react";
import { AppCanvasInputProvider } from "./app-canvas-input-provider";
import { AppCanvasBrandProvider } from "./app-canvas-brand-provider";
import { AppCanvasLocalizationProvider } from "@/shared/i18n/canvas-localization-provider";
import { AppCanvasOverlayProvider } from "./app-overlay-scope";
export function CanvasProviders({ children }: { children: ReactNode }) {
  return <AppCanvasOverlayProvider><AppCanvasInputProvider><AppCanvasBrandProvider><AppCanvasLocalizationProvider>{children}</AppCanvasLocalizationProvider></AppCanvasBrandProvider></AppCanvasInputProvider></AppCanvasOverlayProvider>;
}
