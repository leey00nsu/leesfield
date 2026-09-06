"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  spacePreferencesSchema, type SpaceDefaults, type SpacePreferences, type SpacePreferenceUpdate,
} from "@/shared/generation-graph/space-preferences";

type SettingsChanges = { defaults?: SpaceDefaults; inlineParametersEnabled?: boolean };
type Action = { action: "track"; modelKey: string } | { action: "defaults"; defaults: SpaceDefaults } | { action: "inline"; enabled: boolean } | ({ action: "settings" } & SettingsChanges);

export function useSpacePreferencesSession(scope: string) {
  const [activeScope, setActiveScope] = useState(scope);
  const [snapshot, setSnapshot] = useState<{ scope: string; value: SpacePreferences } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (activeScope !== scope) {
    setActiveScope(scope); setSnapshot(null); setError(null); setSaving(false);
  }
  const current = useRef<SpacePreferences | null>(null);
  const controller = useRef<AbortController | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const refresh = useCallback(async () => {
    const session = controller.current;
    if (!session || session.signal.aborted) return;
    const response = await fetch("/api/spaces/preferences", { cache: "no-store", signal: session.signal });
    if (!response.ok) throw new Error("SPACE_PREFERENCES_UNAVAILABLE");
    const payload = await response.json();
    const preferences = spacePreferencesSchema.parse(payload.preferences);
    if (session !== controller.current || session.signal.aborted) return;
    if (current.current && preferences.revision < current.current.revision) return;
    current.current = preferences; setSnapshot({ scope, value: preferences }); setError(null);
  }, [scope]);
  useEffect(() => {
    const session = new AbortController();
    controller.current = session; current.current = null; queue.current = Promise.resolve();
    // Scope changes remount the workspace in production; keep the hook safe on
    // its own too. Failed reads never become an authoritative empty default.
    void refresh().catch(() => { if (!session.signal.aborted) setError("Could not load Space preferences. Retry before changing defaults."); });
    return () => { session.abort(); current.current = null; };
  }, [scope, refresh]);

  const update = useCallback((action: Action): Promise<void> => {
    const session = controller.current;
    const work = async () => {
      if (!session || session.signal.aborted || session !== controller.current) return;
      if (!current.current && action.action === "track") await refresh();
      if (session.signal.aborted || session !== controller.current) return;
      if (!current.current) throw new Error("SPACE_PREFERENCES_NOT_LOADED");
      if (action.action === "track" && current.current.recentModelKeys[0] === action.modelKey) return;
      setSaving(true);
      try {
        const body: SpacePreferenceUpdate = { ...action, expectedRevision: current.current.revision };
        const response = await fetch("/api/spaces/preferences", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body), signal: session.signal,
        });
        if (session.signal.aborted || session !== controller.current) return;
        if (!response.ok) {
          if (response.status === 409) await refresh();
          throw Object.assign(new Error(response.status === 409 ? "Space preferences changed elsewhere. Close and reopen Settings to review the latest defaults before saving." : "Could not save Space preferences. Existing defaults were preserved."), { code: response.status === 409 ? "SPACE_PREFERENCES_CONFLICT" : "SPACE_PREFERENCES_SAVE_FAILED" });
        }
        const payload = await response.json();
        const next = spacePreferencesSchema.parse(payload.preferences);
        if (session.signal.aborted || session !== controller.current) return;
        if (current.current && next.revision < current.current.revision) return;
        current.current = next; setSnapshot({ scope, value: next }); setError(null);
      } finally { if (!session.signal.aborted && session === controller.current) setSaving(false); }
    };
    const pending = queue.current.then(work, work).catch((reason) => {
      if (!session?.signal.aborted && session === controller.current) setError(reason instanceof Error ? reason.message : "Could not save Space preferences.");
      throw reason;
    });
    queue.current = pending.catch(() => undefined);
    return pending;
  }, [refresh, scope]);
  const trackModel = useCallback((modelKey: string) => { void update({ action: "track", modelKey }).catch(() => undefined); }, [update]);
  const saveDefaults = useCallback((defaults: SpaceDefaults) => update({ action: "defaults", defaults }), [update]);
  const saveSettings = useCallback((changes: SettingsChanges) => update({ action: "settings", ...changes }), [update]);
  const setInlineParametersEnabled = useCallback((enabled: boolean) => update({ action: "inline", enabled }), [update]);
  const retry = useCallback(() => { const session = controller.current; void refresh().catch(() => { if (session === controller.current && !session?.signal.aborted) setError("Could not load Space preferences."); }); }, [refresh]);
  return { data: snapshot?.scope === scope ? snapshot.value : null, error, saving, trackModel, saveDefaults, saveSettings, retry, inlineParametersEnabled: snapshot?.scope === scope ? snapshot.value.inlineParametersEnabled ?? false : false, setInlineParametersEnabled };
}

export const SpacePreferencesContext = createContext<ReturnType<typeof useSpacePreferencesSession> | null>(null);
export function useSpacePreferences() { return useContext(SpacePreferencesContext); }
