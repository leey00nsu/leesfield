"use client";

import { createContext, useContext, type ReactNode } from "react";

const BrandContext = createContext<{full: ReactNode; icon: ReactNode}>({full: null, icon: null});
export const CanvasBrandProvider = BrandContext.Provider;
export function CanvasBrandLogo({iconOnly = false}: {iconOnly?: boolean}) {
  const brand = useContext(BrandContext);
  return iconOnly ? brand.icon : brand.full;
}
