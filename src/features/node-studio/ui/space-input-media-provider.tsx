"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { SpaceInputMediaController } from "../model/space-editor-media";

const Context = createContext<SpaceInputMediaController | null>(null);
export type { SpaceInputExpectation } from "../model/space-editor-media";

export function SpaceInputMediaProvider({ controller, children }: { controller: SpaceInputMediaController; children: ReactNode }) {
  // The canonical scope's layout subscription must update input revisions first.
  useEffect(() => controller.start(), [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useSpaceInputMedia(): SpaceInputMediaController {
  const value = useContext(Context);
  if (!value) throw new Error("SPACE_INPUT_MEDIA_PROVIDER_MISSING");
  return value;
}
