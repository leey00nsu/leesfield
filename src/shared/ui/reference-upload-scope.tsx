"use client";

import { createContext, useContext, useId, useSyncExternalStore, type ReactNode } from "react";

const Scope = createContext<string | null>(null);
const pending = new Map<string, Set<symbol>>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const notify = () => { for (const listener of listeners) listener(); };

export function ReferenceUploadScope({ children, scope }: { children: ReactNode; scope?: string }) {
  const id = useId();
  return <Scope.Provider value={scope ?? id}>{children}</Scope.Provider>;
}

export function hasPendingReferenceUploads(prefix: string) {
  return [...pending].some(([key, entries]) => key.startsWith(prefix) && entries.size > 0);
}

export function usePendingReferenceUploads(prefix: string) {
  return useSyncExternalStore(subscribe, () => hasPendingReferenceUploads(prefix), () => false);
}

export function useReferenceUploads() {
  const scope = useContext(Scope);
  const uploading = useSyncExternalStore(subscribe, () => Boolean(scope && pending.get(scope)?.size), () => false);
  const begin = () => {
    if (!scope) return () => {};
    const token = Symbol();
    const entries = pending.get(scope) ?? new Set<symbol>();
    entries.add(token); pending.set(scope, entries); notify();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      entries.delete(token);
      if (!entries.size && pending.get(scope) === entries) pending.delete(scope);
      notify();
    };
  };
  return { uploading, begin, isUploading: () => Boolean(scope && pending.get(scope)?.size) };
}
