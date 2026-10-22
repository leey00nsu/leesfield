"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { spaceFilmstripKey, spaceFilmstripScheduler } from "../lib/space-filmstrip";

/** Only explicit, visible editing demand pins a decoder or cached result. */
export function useSpaceFilmstrip(asset: MediaAssetDto | null | undefined, enabled: boolean) {
  const key = enabled && asset ? spaceFilmstripKey(asset) : "";
  const subscribe = useCallback((listener: () => void) => (
    enabled && asset ? spaceFilmstripScheduler.subscribe(asset, listener) : () => {}
  ), [asset, enabled]);
  const getSnapshot = useCallback(() => spaceFilmstripScheduler.getSnapshot(key), [key]);
  return useSyncExternalStore(subscribe, getSnapshot, () => spaceFilmstripScheduler.getSnapshot(""));
}
