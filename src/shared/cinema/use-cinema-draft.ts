"use client";
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { readCinemaSettings, type CinemaMedia, type CinemaSettings } from "./cinema-contract";

/** Persists only Cinema selections; prompt, attachments and credentials stay in the host. */
export function useCinemaDraft(media: CinemaMedia) {
  const key = `leesfield:cinema:${media}:v1`;
  const [override, setOverride] = useState<{ settings: CinemaSettings; error: boolean } | null>(null);
  const revision = useRef(0);
  const subscribe = useCallback((listener: () => void) => {
    window.addEventListener("storage", listener);
    window.addEventListener("leesfield:cinema-draft-change", listener);
    return () => { window.removeEventListener("storage", listener); window.removeEventListener("leesfield:cinema-draft-change", listener); };
  }, []);
  const read = useCallback(() => { try { return localStorage.getItem(key); } catch { return false as const; } }, [key]);
  const stored = useSyncExternalStore(subscribe, read, () => undefined);
  const hydrated = useMemo(() => {
    if (!stored) return { settings: undefined, error: stored === false };
    try {
      const data = JSON.parse(stored);
      const raw = data?.draftVersion === 1 ? data.settings : data;
      const read = readCinemaSettings(raw);
      return { settings: read.status === "unsupported" ? raw : read.settings, error: false };
    } catch { return { settings: stored, error: true }; }
  }, [stored]);
  const change = useCallback((value: CinemaSettings) => {
    revision.current++;
    try {
      localStorage.setItem(key, JSON.stringify({ draftVersion: 1, settings: value }));
      setOverride({ settings: value, error: false });
      window.dispatchEvent(new Event("leesfield:cinema-draft-change"));
    } catch { setOverride({ settings: value, error: true }); }
  }, [key]);
  const markEdited = useCallback(() => { revision.current++; }, []);
  return { settings: override ? override.settings : hydrated.settings, change, ready: stored !== undefined, error: override ? override.error : hydrated.error, revision, markEdited };
}
