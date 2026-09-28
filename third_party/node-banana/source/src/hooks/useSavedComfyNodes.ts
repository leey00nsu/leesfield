"use client";

import { useSyncExternalStore } from "react";

import {
  listSavedComfyNodes,
  subscribeSavedComfyNodes,
  type SavedComfyNode,
} from "@/lib/comfy/library";

/**
 * The saved-node library, kept current.
 *
 * `useSyncExternalStore` rather than an effect because the menus that list
 * these are mounted while the dialog that writes them is open — an effect would
 * read once and then go stale the moment something was saved.
 */
export function useSavedComfyNodes(): SavedComfyNode[] {
  return useSyncExternalStore(subscribeSavedComfyNodes, read, empty);
}

/**
 * The snapshot must be referentially stable between writes: `listSavedComfyNodes`
 * parses localStorage afresh each call, and returning a new array from every
 * read would put `useSyncExternalStore` in an infinite loop.
 *
 * Invalidation is registered once at module scope, not per subscriber, so a
 * write that happens while nothing is mounted still marks the cache stale.
 */
let snapshot: SavedComfyNode[] = [];
let dirty = true;

if (typeof window !== "undefined") {
  subscribeSavedComfyNodes(() => {
    dirty = true;
  });
}

function read(): SavedComfyNode[] {
  if (dirty) {
    snapshot = listSavedComfyNodes();
    dirty = false;
  }
  return snapshot;
}

const EMPTY: SavedComfyNode[] = [];
/** The server renders no library at all; localStorage is a browser thing. */
const empty = (): SavedComfyNode[] => EMPTY;

/** Force the next read to hit storage. Exported for tests, which write to
 *  localStorage directly rather than through the library. */
export function invalidateSavedComfyNodes(): void {
  dirty = true;
}
