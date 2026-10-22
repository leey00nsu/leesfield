"use client";
import type { ReactNode } from "react";
import { AppCanvasOverlayProvider } from "./app-overlay-scope";

export function CanvasProviders({ children }: { children: ReactNode }) {
  return <AppCanvasOverlayProvider>{children}</AppCanvasOverlayProvider>;
}
