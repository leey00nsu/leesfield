"use client";

import { useCanvasTranslation } from "../leesfield/localization";

import { useState } from "react";
import type { ReactNode } from "react";
import { ProjectSetupModal } from "./ProjectSetupModal";
import type { HostedProjectSettingsProps } from "./ProjectSetupModal";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";
import type { NodeBananaCanvasSettings } from "../leesfield/canvas-runtime";
import { HostedSpaceBrowser } from "../leesfield/hosted-space-browser";

export type NodeBananaHeaderGraph = {
  id: string;
  title: string;
};

export type NodeBananaHostedHeaderProps = HostedProjectSettingsProps & {
  hasUnsavedChanges?: boolean;
  commentsNavigation?: ReactNode;
  title: string;
  brand?: ReactNode;
  graphs: readonly NodeBananaHeaderGraph[];
  activeGraphId: string;
  saveLabel: string;
  saving?: boolean;
  writable?: boolean;
  creating?: boolean;
  deleting?: boolean;
  canvasSettings?: NodeBananaCanvasSettings;
  onCanvasSettingsChange?: (settings: NodeBananaCanvasSettings) => void;
  onTitleChange: (title: string) => void;
  onSelectGraph: (graphId: string) => void;
  onCreateGraph: (title: string) => void;
  onSave: () => void;
  onDelete: () => void;
};



export function Header({ title, brand, commentsNavigation, hasUnsavedChanges = false, saveLabel, onCreateGraph, onDelete, creating, deleting,
  saving: isSaving = false, writable = true, graphs, activeGraphId, onSelectGraph, onSave,
  canvasSettings = { panMode: "space", zoomMode: "altScroll", selectionMode: "click" },
  onCanvasSettingsChange = () => undefined, onTitleChange, ...settingsProps
}: NodeBananaHostedHeaderProps) {
  const tc = useCanvasTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const workflowName = title;
  const isProjectConfigured = !!workflowName;
  const settingsButtons = (
    <div className="flex items-center gap-0.5 ml-1 pl-1 border-l border-neutral-700/50">
      <button
        onClick={() => setSettingsOpen(true)}
        className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
        title={tc("Space settings")} aria-label={tc("Space settings")}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>
    </div>
  );

  return (<>
    {settingsOpen && <ProjectSetupModal {...settingsProps} title={title} writable={writable} canvasSettings={canvasSettings} onCanvasSettingsChange={onCanvasSettingsChange} onTitleChange={onTitleChange} onClose={() => setSettingsOpen(false)} />}
    {browserOpen && <HostedSpaceBrowser graphs={graphs} activeGraphId={activeGraphId} onSelectGraph={onSelectGraph} onCreateGraph={onCreateGraph} onDelete={onDelete} creating={creating} deleting={deleting} onClose={() => setBrowserOpen(false)} />}
      <header data-node-banana-component="Header" className="h-11 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          {brand ?? <span className="text-2xl font-semibold text-neutral-100 tracking-tight">{tc("Spaces")}</span>}

          <div className="flex items-center gap-2 ml-4 pl-4 border-l border-neutral-700">
            {isProjectConfigured ? (
              <>
                <span className="text-sm text-neutral-300">{workflowName}</span>

                {/* File operations group */}
                <div className="flex items-center gap-0.5 ml-2 pl-2 border-l border-neutral-700/50">
                  <button
                    onClick={onSave}
                    disabled={isSaving || !writable}
                    className="relative p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors disabled:opacity-50"
                    title={isSaving ? tc("Saving...") : tc("Save space")} aria-label={tc("Save space")}
                    data-tutorial="save-button"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                      />
                    </svg>
                    {hasUnsavedChanges && !isSaving && (
                      <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-neutral-900" />
                    )}
                  </button>
                  <button
                    onClick={() => setBrowserOpen(true)}
                    className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
                    title={tc("Open space")} aria-label={tc("Open space")}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                      />
                    </svg>
                  </button>
                </div>

                {settingsButtons}
              </>
            ) : (
              <>
                <span className="text-sm text-neutral-500 italic">{tc("Untitled")}</span>

                {/* File operations group */}
                <div className="flex items-center gap-0.5 ml-2 pl-2 border-l border-neutral-700/50">
                  <button
                    onClick={() => setSettingsOpen(true)}
                    className="relative p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
                    title={tc("Save space")} aria-label={tc("Save space")}
                    data-tutorial="save-button"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                      />
                    </svg>
                    <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-neutral-900" />
                  </button>
                  <button
                    onClick={() => setBrowserOpen(true)}
                    className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
                    title={tc("Open space")} aria-label={tc("Open space")}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                      />
                    </svg>
                  </button>
                </div>

                {settingsButtons}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {commentsNavigation}
          <span className="text-neutral-400" role="status">{saveLabel}</span>
          <span className="text-neutral-500">·</span>
          <button
            onClick={() => setShortcutsOpen(true)}
            className="text-neutral-400 hover:text-neutral-200 transition-colors"
            title={tc("Keyboard shortcuts (?)")} aria-label={tc("Keyboard shortcuts")}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0119.5 19.5h-15a2.25 2.25 0 01-2.25-2.25V6.75z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8" />
            </svg>
          </button>
        </div>
      </header>

    <KeyboardShortcutsDialog isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} hosted />
  </>);
}

export function CommentsNavigationIcon({ count: totalCount, unreadCount: unviewedCount, onNavigate: handleClick }: { count: number; unreadCount: number; onNavigate: () => void }) {
  const tc = useCanvasTranslation();
  // Don't render if no comments
  if (totalCount === 0) {
    return null;
  }

  const displayCount = unviewedCount > 9 ? "9+" : unviewedCount.toString();

  return (
    <button
      onClick={handleClick} data-canvas-action="comments" aria-label={tc("Navigate comments")}
      className="relative p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
      title={`${unviewedCount} unviewed comment${unviewedCount !== 1 ? 's' : ''} (${totalCount} total)`}
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" />
      </svg>
      {unviewedCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center text-[9px] font-bold text-white bg-blue-500 rounded-full px-0.5">
          {displayCount}
        </span>
      )}
    </button>
  );
}
