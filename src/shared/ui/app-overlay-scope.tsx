"use client";

import { createContext, useContext, type ReactNode } from "react";

const AppOverlayScope = createContext<"canvas" | "dialog" | undefined>(undefined);

/** Body portals must stay above the full-screen canvas that owns the controls. */
export function AppCanvasOverlayProvider({ children }: { children: ReactNode }) {
  return <AppOverlayScope.Provider value="canvas">{children}</AppOverlayScope.Provider>;
}

export function AppDialogOverlayProvider({ children }: { children: ReactNode }) {
  return <AppOverlayScope.Provider value="dialog">{children}</AppOverlayScope.Provider>;
}

export function useAppOverlayScope() {
  return useContext(AppOverlayScope);
}
