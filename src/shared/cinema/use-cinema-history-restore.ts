"use client";
import { useEffect, useRef, useState } from "react";
import { parseCinemaSettings, type CinemaMedia, type CinemaSettings } from "./cinema-contract";
import { useCinemaHistory, type CinemaHistory } from "./use-cinema-history";

export function useCinemaHistoryRestore({ historyId, media, ready, revision, change, restorePrompt, restoreInputs }: {
  historyId: string | null; media: CinemaMedia | "audio"; ready: boolean;
  revision: React.MutableRefObject<number>; change?: (settings: CinemaSettings) => void;
  restorePrompt: (prompt: string) => void;
  restoreInputs?: (inputs: Pick<CinemaHistory, "references" | "options">) => void;
}) {
  const history = useCinemaHistory(historyId, media, ready);
  const [failedId, setFailedId] = useState<string | null>(null);
  const callbacks = useRef({ change, restorePrompt, restoreInputs });
  useEffect(() => { callbacks.current = { change, restorePrompt, restoreInputs }; });
  const initial = useRef(0);
  const restored = useRef<string | null>(null);
  useEffect(() => { initial.current = revision.current; restored.current = null; }, [historyId, revision]);
  useEffect(() => {
    if (!historyId || !history.data || restored.current === historyId || revision.current !== initial.current) return;
    const data = history.data;
    let active = true;
    void (async () => {
      // Restoration follows the async authoring response and is cancelled on
      // model/history changes or a user edit before the next microtask.
      await Promise.resolve();
      if (!active || revision.current !== initial.current || restored.current === historyId) return;
      restored.current = historyId;
      try {
        callbacks.current.restoreInputs?.({ references: data.references ?? [], options: data.options ?? [] });
        callbacks.current.restorePrompt(data.cinema?.sourcePrompt ?? data.prompt);
        if (media !== "audio") callbacks.current.change?.(parseCinemaSettings(data.cinema?.settings, media));
        setFailedId(null);
      } catch { setFailedId(historyId); }
    })();
    return () => { active = false; };
  }, [historyId, history.data, revision, media]);
  return { ...history, error: history.error || Boolean(historyId && failedId === historyId) };
}
