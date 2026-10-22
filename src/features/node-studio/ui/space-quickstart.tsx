"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, FolderOpen, GraduationCap, LayoutGrid, Plus } from "lucide-react";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { AppBrandLogo } from "@/shared/ui/app-brand-logo";
import { AppDialog, AppDialogContent, AppDialogHeader, AppDialogTitle } from "@/shared/ui/app-dialog";
import { AppSelect } from "@/shared/ui/app-form-control";
import { getSpaceQuickstartWorkflow, spaceQuickstartTemplates } from "../model/space-quickstart-templates";
import type { SpacePresetWorkflow, SpaceQuickstartContent } from "../model/space-quickstart-types";
import styles from "./space-quickstart.module.css";

export function SpaceQuickstart({ onClose, onCreate, onBrowse }: {
  onClose: () => void; onCreate: (workflow: SpacePresetWorkflow | null, tutorial?: boolean) => Promise<void>; onBrowse: () => void;
}) {
  const tc = useCanvasTranslation();
  const [templates, setTemplates] = useState(false), [search, setSearch] = useState("");
  const [category, setCategory] = useState("all"), [content, setContent] = useState<SpaceQuickstartContent>("minimal");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const pending = useRef(false), composing = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const create = async (workflow: SpacePresetWorkflow | null, tutorial = false) => {
    if (pending.current || composing.current) return;
    pending.current = true; setBusy(true); setError(null);
    try { await onCreate(workflow, tutorial); if (mounted.current) onClose(); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : tc("Unable to create Space.")); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const filtered = spaceQuickstartTemplates.filter(template =>
    (category === "all" || template.category === category) &&
    [template.name, template.description, tc(template.name), tc(template.description)].join(" ").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const clear = () => { setSearch(""); setCategory("all"); };
  return <AppDialog open onOpenChange={(open, details) => {
    if (open) return;
    if (pending.current || composing.current || (details.event instanceof KeyboardEvent && (details.event.isComposing || details.event.keyCode === 229))) details.cancel();
    else onClose();
  }}>
    <AppDialogContent surface="canvas" padding="none" showCloseButton={false}
      className={templates ? styles.templatesDialog : styles.dialog}
      onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
      onCompositionStartCapture={() => { composing.current = true; }} onCompositionEndCapture={() => { composing.current = false; }}>
      <AppDialogHeader className={styles.heading}>
        {templates && <button type="button" disabled={busy} className={styles.icon} aria-label={tc("Back")} onClick={() => setTemplates(false)}><ArrowLeft size={18} /></button>}
        <AppDialogTitle>{tc(templates ? "Template Explorer" : "Quickstart")}</AppDialogTitle>
        <button type="button" disabled={busy} className={styles.close} aria-label={tc("Close Quickstart")} onClick={onClose}>{tc("Close")}</button>
      </AppDialogHeader>
      <fieldset disabled={busy} className={styles.fieldset}>
        {templates ? <div className={styles.explorer}>
          <aside className={styles.sidebar}>
            <input aria-label={tc("Search templates...")} placeholder={tc("Search templates...")} value={search} onChange={event => setSearch(event.target.value)} />
            <h3>{tc("Category")}</h3>
            <div className={styles.categories}>{[["all", "All"], ["simple", "Simple"], ["advanced", "Advanced"]].map(([key, label]) =>
              <button type="button" key={key} aria-pressed={category === key} onClick={() => setCategory(key)}>{tc(label)}</button>)}</div>
            {(search || category !== "all") && <button type="button" className={styles.close} onClick={clear}>{tc("Clear filters")}</button>}
          </aside>
          <div className={styles.templateContent}>
            <label className={styles.starting}>{tc("Starting content")}<AppSelect ariaLabel={tc("Starting content")} value={content} disabled={busy}
              onValueChange={value => setContent(value as SpaceQuickstartContent)}
              options={[{ value: "minimal", label: tc("Prompt examples") }, { value: "empty", label: tc("Empty inputs") }]} /></label>
            {filtered.length ? <div className={styles.grid}>{filtered.map(template => <article className={styles.card} key={template.id}>
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={template.icon} strokeLinecap="round" strokeLinejoin="round" /></svg>
              <h3>{tc(template.name)}</h3><p>{tc(template.description)}</p>
              <span className={styles.nodeCount}>{template.imageCount + 3} {tc("nodes")}</span>
              <button type="button" onClick={() => void create(getSpaceQuickstartWorkflow(template.id, content))}>{tc("Use workflow")}</button>
            </article>)}</div> : <div className={styles.empty}><p>{tc("No templates match your filters")}</p><button type="button" onClick={clear}>{tc("Clear all filters")}</button></div>}
          </div>
        </div> : <div className={styles.welcome}>
          <div className={styles.intro}><AppBrandLogo /><p>{tc("A node based workflow editor for generative AI pipelines. Connect nodes to build pipelines that transform and generate images, video and audio.")}</p></div>
          <div className={styles.options}>
            <Option icon={<Plus />} title={tc("New space")} description={tc("Start an empty Space")} onClick={() => void create(null)} />
            <Option icon={<FolderOpen />} title={tc("Spaces")} description={tc("Browse your Spaces")} onClick={onBrowse} />
            <Option icon={<LayoutGrid />} title={tc("Templates")} description={tc("Pre-built workflows")} onClick={() => setTemplates(true)} />
            <Option icon={<GraduationCap />} title={tc("Tutorial")} description={tc("Learn the basics in a new Space")} onClick={() => void create(null, true)} />
          </div>
        </div>}
      </fieldset>
      {busy && <p role="status" className={styles.status}>{tc("Creating Space…")}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </AppDialogContent>
  </AppDialog>;
}

function Option({ icon, title, description, onClick }: { icon: ReactNode; title: string; description: string; onClick: () => void }) {
  return <button type="button" className={styles.option} onClick={onClick}><span className={styles.optionIcon}>{icon}</span><span><strong>{title}</strong><small>{description}</small></span></button>;
}
