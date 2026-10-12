"use client";
import { useEffect, useState } from "react";
import { cinemaSnapshotSchema, parseCinemaSettings, type CinemaMedia, type CinemaSnapshot } from "./cinema-contract";
import { historyReferencesSchema, type HistoryReference } from "@/shared/generation/history-references";
import { historyOptionsSchema, type HistoryOption } from "@/shared/generation/history-options";

export type CinemaHistory = { cinema: CinemaSnapshot | null; prompt: string; model: string | null; references: HistoryReference[]; options: HistoryOption[] };
export function useCinemaHistory(historyId: string | null | undefined, media: CinemaMedia | "audio", enabled = true) {
  const [result, setResult] = useState<{ id?: string; data?: CinemaHistory; error?: boolean }>({});
  useEffect(() => {
    if (!historyId || !enabled) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/history/${encodeURIComponent(historyId)}?type=${media}&origin=generation&view=authoring`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("CINEMA_HISTORY_UNAVAILABLE");
        const raw = await response.json();
        const cinema = raw.cinema == null ? null : cinemaSnapshotSchema.parse(raw.cinema);
        if (cinema && media !== "audio") parseCinemaSettings(cinema.settings, media);
        if (typeof raw.prompt !== "string" || (raw.model !== null && typeof raw.model !== "string")) throw new Error("CINEMA_HISTORY_UNSUPPORTED");
        const references = historyReferencesSchema.parse(raw.references ?? []);
        const options = historyOptionsSchema.parse(raw.options ?? []);
        if (!controller.signal.aborted) setResult({ id: historyId, data: { cinema, prompt: raw.prompt, model: raw.model, references, options } });
      } catch { if (!controller.signal.aborted) setResult({ id: historyId, error: true }); }
    })();
    return () => controller.abort();
  }, [historyId, media, enabled]);
  return { data: enabled && result.id === historyId ? result.data : undefined, error: enabled && result.id === historyId && result.error, loading: Boolean(historyId && enabled && result.id !== historyId) };
}
