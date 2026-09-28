"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { NodeBananaCanvasSettings } from "./canvas-runtime";
export type HostedDefaultKind = "image" | "video" | "audio";
export type HostedNodeDefaults = Partial<Record<HostedDefaultKind, string>>;
export type HostedProjectSettingsProps = {
  nodeDefaults?: HostedNodeDefaults;
  models?: readonly { id: string; name: string; mediaKind: HostedDefaultKind; provider?: string }[];
  onSaveNodeDefaults?: (defaults: HostedNodeDefaults) => Promise<void>;
  onSaveSettings?: (changes: { defaults?: HostedNodeDefaults; inlineParametersEnabled?: boolean }) => Promise<void>;
  nodeDefaultsLoading?: boolean;
  nodeDefaultsError?: string | null;
  onRetryNodeDefaults?: () => void;
  inlineParametersEnabled?: boolean;
  onInlineParametersChange?: (enabled: boolean) => void | Promise<void>;
  renderModelPicker?: (kind: HostedDefaultKind, onSelect: (id: string) => void, onClose: () => void) => ReactNode;
};


export function useHostedProjectSettings({
 title, writable, canvasSettings, onCanvasSettingsChange, onTitleChange, onClose,
 nodeDefaults = {}, models = [], onSaveNodeDefaults, nodeDefaultsLoading = false,
 nodeDefaultsError, onRetryNodeDefaults, inlineParametersEnabled = true,
 onInlineParametersChange, renderModelPicker, onSaveSettings,
}: HostedProjectSettingsProps & {
 title: string; writable: boolean; canvasSettings: NodeBananaCanvasSettings;
 onCanvasSettingsChange: (settings: NodeBananaCanvasSettings) => void;
 onTitleChange: (title: string) => void; onClose: () => void;
}) {
 const [activeTab, setActiveTab] = useState<"project" | "nodeDefaults" | "canvas">("project");
 const [name, setName] = useState(title);
 const [localNodeDefaults, setLocalNodeDefaults] = useState(nodeDefaults);
 const [localCanvasSettings, setLocalCanvasSettings] = useState(canvasSettings);
 const [localInline, setLocalInline] = useState(inlineParametersEnabled);
 const [pickerKind, setPickerKind] = useState<HostedDefaultKind | null>(null);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [conflict, setConflict] = useState(false);
 const defaultsEdited = useRef(false);
 const inlineEdited = useRef(false);
 useEffect(() => { if (!nodeDefaultsLoading && !inlineEdited.current) setLocalInline(inlineParametersEnabled); }, [inlineParametersEnabled, nodeDefaultsLoading]);
 const dialogRef = useRef<HTMLDivElement>(null);
 const closeRef = useRef(onClose);
 closeRef.current = () => { if (!busy) onClose(); };
 const defaultsSnapshot = JSON.stringify(nodeDefaults);
 useEffect(() => { if (!nodeDefaultsLoading && !defaultsEdited.current) setLocalNodeDefaults(JSON.parse(defaultsSnapshot) as HostedNodeDefaults); }, [defaultsSnapshot, nodeDefaultsLoading]);
 const handleSave = async () => {
   if (conflict || busy) return;
   setBusy(true); setError(null);
   try {
     if (defaultsEdited.current) {
       if (!onSaveNodeDefaults && !onSaveSettings) throw new Error("Node defaults are unavailable.");
       for (const kind of ["image", "video", "audio"] as const) {
         if (localNodeDefaults[kind] && !models.some((model) => model.id === localNodeDefaults[kind] && model.mediaKind === kind)) throw new Error("Select an available model before saving.");
       }
       if (!onSaveSettings) await onSaveNodeDefaults!(localNodeDefaults);
     }
     const inlineChanged = inlineEdited.current && localInline !== inlineParametersEnabled;
     if (onSaveSettings && (defaultsEdited.current || inlineChanged)) {
       await onSaveSettings({ ...(defaultsEdited.current ? { defaults: localNodeDefaults } : {}), ...(inlineChanged ? { inlineParametersEnabled: localInline } : {}) });
     } else if (inlineChanged) await onInlineParametersChange?.(localInline);
     onCanvasSettingsChange(localCanvasSettings);
     if (writable) onTitleChange(name.trim());
     onClose();
   } catch (cause) { if (cause instanceof Error && "code" in cause && cause.code === "SPACE_PREFERENCES_CONFLICT") setConflict(true); setError(cause instanceof Error ? cause.message : "Could not save settings. Please try again."); }
   finally { setBusy(false); }
 };
  return { activeTab, setActiveTab, name, setName, localNodeDefaults, setLocalNodeDefaults, localCanvasSettings, setLocalCanvasSettings, localInline, setLocalInline, pickerKind, setPickerKind, busy, error, conflict, defaultsEdited, inlineEdited, dialogRef, closeRef, handleSave, writable, models, nodeDefaultsLoading, nodeDefaultsError, onRetryNodeDefaults, renderModelPicker };
}
