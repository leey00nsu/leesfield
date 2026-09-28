"use client";

import { useCanvasTranslation } from "./localization";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QuickstartInitialView } from "../components/quickstart/QuickstartInitialView";
import { TemplateExplorerView } from "../components/quickstart/TemplateExplorerView";
import type { HostedPresetWorkflow } from "./hosted-preset-types";
export function HostedQuickstart({ onClose, onCreate, onBrowse }: {
  onClose: () => void; onCreate: (workflow: HostedPresetWorkflow | null, tutorial?: boolean) => Promise<void>; onBrowse: () => void;
}) {
  const tc = useCanvasTranslation();
  const [view, setView] = useState<"initial" | "templates">("initial");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null), closeRef = useRef(onClose), busyRef = useRef(false), mounted = useRef(true);
  closeRef.current = onClose; busyRef.current = busy;
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])') ?? []);
    controls()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); if (!busyRef.current) closeRef.current(); }
      if (event.key === "Tab") { const items = controls(); if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); } else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); } }
    };
    const focus = (event: FocusEvent) => { if (event.target instanceof Node && !dialog.current?.contains(event.target)) controls()[0]?.focus(); };
    window.addEventListener("keydown", key, true); document.addEventListener("focusin", focus);
    return () => { mounted.current = false; window.removeEventListener("keydown", key, true); document.removeEventListener("focusin", focus); if (previous?.isConnected) previous.focus(); };
  }, []);
  const create = async (workflow: HostedPresetWorkflow | null, tutorial = false) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    try { await onCreate(workflow, tutorial); if (mounted.current) onClose(); }
    catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : "Unable to create Space."); }
    finally { if (mounted.current) { busyRef.current = false; setBusy(false); } }
  };
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={tc("Quickstart")} className={"w-full mx-4 bg-neutral-800 rounded-xl border border-neutral-700 shadow-2xl overflow-auto max-h-[85vh] flex flex-col " + (view === "templates" ? "max-w-6xl" : "max-w-2xl")}>
      <button type="button" onClick={onClose} disabled={busy} className="self-end p-3" aria-label={tc("Close Quickstart")}>{tc("Close")}</button>
      <fieldset disabled={busy} className="min-w-0 contents">
        {view === "initial" ? <QuickstartInitialView onNewProject={() => void create(null)} onSelectLoad={onBrowse} onSelectTemplates={() => setView("templates")} onStartTutorial={() => void create(null, true)} />
          : <TemplateExplorerView onBack={() => setView("initial")} onWorkflowSelected={(workflow) => create(workflow)} />}
      </fieldset>
      {busy && <p role="status" className="p-4">{tc("Creating Space…")}</p>}{error && <p role="alert" className="p-4 text-red-300">{error}</p>}
    </div>
  </div>, document.body);
}
