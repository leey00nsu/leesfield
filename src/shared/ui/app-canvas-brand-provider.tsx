"use client";

import type { ReactNode } from "react";
import { CanvasBrandProvider } from "@node-banana-runtime/branding";
import { AppBrandLogo } from "./app-brand-logo";

const brand = {full: <AppBrandLogo size="sm" />, icon: <AppBrandLogo size="sm" variant="icon" />};
export function AppCanvasBrandProvider({children}: {children: ReactNode}) {
  return <CanvasBrandProvider value={brand}>{children}</CanvasBrandProvider>;
}
