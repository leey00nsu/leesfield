"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useSpaceEditor } from "./space-editor-provider";

type ImageFit = "cover" | "contain";
type FitSubscription = { fit: ImageFit; listeners: Set<() => void> };
const storagePrefix = "node-studio.image-fit:";
const subscriptions = new Map<string, FitSubscription>();
// Keep the setting usable when browser storage is blocked or full. Bound the
// fallback independently of mounted nodes; normal preferences live in storage.
const memoryFits = new Map<string, ImageFit>();
const memoryLimit = 1000;

function parseFit(value: string | null): ImageFit { return value === "contain" ? "contain" : "cover"; }
function readFit(key: string): ImageFit {
  const fallback = memoryFits.get(key);
  if (fallback) return fallback;
  try { return typeof window === "undefined" ? "cover" : parseFit(window.localStorage.getItem(key)); }
  catch { return "cover"; }
}
function snapshot(key: string): ImageFit { return subscriptions.get(key)?.fit ?? readFit(key); }
function notify(key: string, fit: ImageFit) {
  const subscription = subscriptions.get(key);
  if (!subscription || subscription.fit === fit) return;
  subscription.fit = fit;
  for (const listener of subscription.listeners) listener();
}
function refreshStoredFit(key: string) {
  try {
    // An event can be queued before a newer write in this tab. Its payload is
    // historical; current storage is authoritative once it can be read.
    const fit = parseFit(window.localStorage.getItem(key));
    memoryFits.delete(key);
    notify(key, fit);
  } catch {
    // Without a current read, retain the last known local/in-memory choice.
  }
}
function storageChanged(event: StorageEvent) {
  try { if (event.storageArea && event.storageArea !== window.localStorage) return; }
  catch { return; }
  if (event.key === null) {
    for (const key of new Set([...subscriptions.keys(), ...memoryFits.keys()])) refreshStoredFit(key);
  } else if (event.key.startsWith(storagePrefix)) {
    refreshStoredFit(event.key);
  }
}
function subscribe(key: string, listener: () => void) {
  if (subscriptions.size === 0) window.addEventListener("storage", storageChanged);
  let subscription = subscriptions.get(key);
  if (!subscription) {
    subscription = { fit: readFit(key), listeners: new Set() };
    subscriptions.set(key, subscription);
  }
  subscription.listeners.add(listener);
  return () => {
    subscription.listeners.delete(listener);
    if (!subscription.listeners.size) subscriptions.delete(key);
    if (subscriptions.size === 0) window.removeEventListener("storage", storageChanged);
  };
}
function writeFit(key: string, fit: ImageFit) {
  if (snapshot(key) === fit) return;
  try {
    window.localStorage.setItem(key, fit);
    memoryFits.delete(key);
  } catch {
    memoryFits.delete(key);
    memoryFits.set(key, fit);
    if (memoryFits.size > memoryLimit) memoryFits.delete(memoryFits.keys().next().value!);
  }
  notify(key, fit);
}

/** Browser-local node presentation; never changes Graph config or autosave. */
export function useSpaceImageFit(nodeId: string): { fit: ImageFit; setFit: (fit: ImageFit) => void } {
  const { session } = useSpaceEditor();
  const graphSnapshot = useCallback(() => session.getSnapshot().id, [session]);
  const graphId = useSyncExternalStore(session.store.subscribe, graphSnapshot, graphSnapshot);
  const key = `${storagePrefix}${encodeURIComponent(graphId)}:${encodeURIComponent(nodeId)}`;
  const subscribeFit = useCallback((listener: () => void) => subscribe(key, listener), [key]);
  const fitSnapshot = useCallback(() => snapshot(key), [key]);
  const fit = useSyncExternalStore(subscribeFit, fitSnapshot, () => "cover" as const);
  const setFit = useCallback((next: ImageFit) => {
    const state = session.getSnapshot();
    if (state.id !== graphId || state.disposed || !state.writable || !state.nodeById.has(nodeId) || (next !== "cover" && next !== "contain")) return;
    writeFit(key, next);
  }, [session, graphId, nodeId, key]);
  return { fit, setFit };
}
