"use client";
import { useEffect, useRef } from "react";
import { parseCinemaSettings, type CinemaMedia, type CinemaSettings } from "./cinema-contract";
import { useCinemaHistory } from "./use-cinema-history";

export function useCinemaHistoryRestore({ historyId, media, ready, revision, change, restorePrompt }: {
  historyId: string | null; media: CinemaMedia; ready: boolean;
  revision: React.MutableRefObject<number>; change: (settings: CinemaSettings) => void;
  restorePrompt: (prompt: string) => void;
}) {
  const history = useCinemaHistory(historyId, media, ready);
  const callbacks = useRef({ change, restorePrompt });
  useEffect(() => { callbacks.current = { change, restorePrompt }; });
  const initial = useRef(0);
  const restored = useRef<string | null>(null);
  useEffect(() => { initial.current = revision.current; restored.current = null; }, [historyId, revision]);
  useEffect(() => {
    if (!historyId || !history.data || restored.current === historyId || revision.current !== initial.current) return;
    restored.current = historyId;
    callbacks.current.restorePrompt(history.data.cinema?.sourcePrompt ?? history.data.prompt);
    callbacks.current.change(parseCinemaSettings(history.data.cinema?.settings, media));
  }, [historyId, history.data, revision, media]);
  return history;
}
