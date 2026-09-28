"use client";

import { CanvasButton, CanvasDialog, CanvasTabBar } from "../leesfield/inputs";
import { CanvasBrandLogo } from "../leesfield/branding";
import { useCanvasTranslation } from "../leesfield/localization";
import { useHostedProjectSettings } from "../leesfield/hosted-project-settings";
export type { HostedDefaultKind, HostedNodeDefaults, HostedProjectSettingsProps } from "../leesfield/hosted-project-settings";
// Provider icons
const GeminiIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
  </svg>
);

const ReplicateIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 1000 1000" fill="currentColor">
    <polygon points="1000,427.6 1000,540.6 603.4,540.6 603.4,1000 477,1000 477,427.6" />
    <polygon points="1000,213.8 1000,327 364.8,327 364.8,1000 238.4,1000 238.4,213.8" />
    <polygon points="1000,0 1000,113.2 126.4,113.2 126.4,1000 0,1000 0,0" />
  </svg>
);

const FalIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 1855 1855" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M1181.65 78C1212.05 78 1236.42 101.947 1239.32 131.261C1265.25 392.744 1480.07 600.836 1750.02 625.948C1780.28 628.764 1805 652.366 1805 681.816V1174.18C1805 1203.63 1780.28 1227.24 1750.02 1230.05C1480.07 1255.16 1265.25 1463.26 1239.32 1724.74C1236.42 1754.05 1212.05 1778 1181.65 1778H673.354C642.951 1778 618.585 1754.05 615.678 1724.74C589.754 1463.26 374.927 1255.16 104.984 1230.05C74.7212 1227.24 50 1203.63 50 1174.18V681.816C50 652.366 74.7213 628.764 104.984 625.948C374.927 600.836 589.754 392.744 615.678 131.261C618.585 101.946 642.951 78 673.353 78H1181.65ZM402.377 926.561C402.377 1209.41 638.826 1438.71 930.501 1438.71C1222.18 1438.71 1458.63 1209.41 1458.63 926.561C1458.63 643.709 1222.18 414.412 930.501 414.412C638.826 414.412 402.377 643.709 402.377 926.561Z" />
  </svg>
);

const WaveSpeedIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 512 512" fill="currentColor">
    <path d="M308.946 153.758C314.185 153.758 318.268 158.321 317.516 163.506C306.856 237.02 270.334 302.155 217.471 349.386C211.398 354.812 203.458 357.586 195.315 357.586H127.562C117.863 357.586 110.001 349.724 110.001 340.025V333.552C110.001 326.82 113.882 320.731 119.792 317.505C176.087 286.779 217.883 232.832 232.32 168.537C234.216 160.09 241.509 153.758 250.167 153.758H308.946Z" />
    <path d="M183.573 153.758C188.576 153.758 192.592 157.94 192.069 162.916C187.11 210.12 160.549 250.886 122.45 275.151C116.916 278.676 110 274.489 110 267.928V171.318C110 161.62 117.862 153.758 127.56 153.758H183.573Z" />
    <path d="M414.815 153.758C425.503 153.758 433.734 163.232 431.799 173.743C420.697 234.038 398.943 290.601 368.564 341.414C362.464 351.617 351.307 357.586 339.419 357.586H274.228C266.726 357.586 262.611 348.727 267.233 342.819C306.591 292.513 334.86 233.113 348.361 168.295C350.104 159.925 357.372 153.758 365.922 153.758H414.815Z" />
  </svg>
);

// Get provider icon component
const getProviderIcon = (provider: string | undefined) => {
  switch (provider) {
    case "gemini":
      return <GeminiIcon />;
    case "replicate":
      return <ReplicateIcon />;
    case "fal":
      return <FalIcon />;
    case "wavespeed":
      return <WaveSpeedIcon />;
    default:
      return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true"><rect x="3" y="4" width="18" height="6" rx="2" /><rect x="3" y="14" width="18" height="6" rx="2" /><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" /></svg>;
  }
};


// The original supported Settings render tree consumes host-owned persistence state.
export function ProjectSetupModal(props: Parameters<typeof useHostedProjectSettings>[0]) {
  const tc = useCanvasTranslation();
 const { activeTab, setActiveTab, name, setName, localNodeDefaults, setLocalNodeDefaults, localCanvasSettings, setLocalCanvasSettings, localInline, setLocalInline, pickerKind, setPickerKind, busy, error, conflict, defaultsEdited, inlineEdited, dialogRef, closeRef, handleSave, writable, models, nodeDefaultsLoading, nodeDefaultsError, onRetryNodeDefaults, renderModelPicker } = useHostedProjectSettings(props);
  return (
    <CanvasDialog componentName="ProjectSetupModal" contentRef={dialogRef} title={tc("Space Settings")} onClose={()=>closeRef.current()} className="max-w-2xl h-[min(760px,calc(100dvh-2rem))] flex flex-col overflow-hidden">
        <div className="px-6 pt-4"><CanvasTabBar value={activeTab} onValueChange={value=>setActiveTab(value as typeof activeTab)} label={tc("Settings sections")} items={[{value:"project",label:tc("Space")},{value:"nodeDefaults",label:tc("Node Defaults")},{value:"canvas",label:tc("Canvas")}]} /></div>
        {/* Scrollable tab content area */}
        <div className="flex-1 min-h-0 overflow-y-auto px-8 py-5">

        {/* Project Tab Content */}
        {activeTab === "project" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-neutral-400 mb-1">{tc("Space name")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={tc("Untitled Space")} aria-label={tc("Space name")} maxLength={120} disabled={!writable}
                autoFocus
                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-neutral-100 text-sm focus:outline-none focus:border-neutral-500"
              />
            </div>

            <div className="pt-2 border-t border-neutral-700">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <span className="text-sm text-neutral-200">{tc("Show model settings on nodes")}</span>
                  <p className="text-xs text-neutral-400">{tc("Show model parameters inside generation nodes instead of the side panel")}</p>
                </div>
                <button
                  type="button"
                  role="switch" aria-label={tc("Show model settings on nodes")}
                  aria-checked={localInline}
                  disabled={busy || nodeDefaultsLoading}
                  onClick={() => { inlineEdited.current = true; setLocalInline(!localInline); }}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${localInline ? "bg-blue-500" : "bg-neutral-600"}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${localInline ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                </button>
              </label>
            </div>

          </div>
        )}

        {activeTab === "nodeDefaults" && <div className="space-y-3">
          {nodeDefaultsLoading && <p role="status" className="text-xs text-neutral-400">{tc("Loading defaults...")}</p>}
          {nodeDefaultsError && <div role="alert" className="text-sm text-red-400">{nodeDefaultsError}<button type="button" onClick={onRetryNodeDefaults}>{tc("Retry")}</button></div>}
          {(["image", "video", "audio"] as const).map((kind) => (
            
            <div key={kind} className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-medium text-neutral-100">{tc("Default")}{kind === "image" ? tc("Image") : kind === "video" ? tc("Video") : tc("Audio")}{tc("Model")}</span>
                <div className="flex items-center gap-2">
                  {localNodeDefaults[kind] ? (
                    <>
                      <div className="flex items-center gap-1.5 text-xs text-neutral-300">
                        {getProviderIcon(models.find((model) => model.id === localNodeDefaults[kind])?.provider)}
                        <span className="truncate max-w-[150px]">
                          {models.find((model) => model.id === localNodeDefaults[kind])?.name ?? localNodeDefaults[kind]}
                        </span>
                      </div>
                      <button
                        disabled={busy || nodeDefaultsLoading || !renderModelPicker} type="button"
                        onClick={() => setPickerKind(kind)}
                        className="px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded transition-colors"
                      >{tc("Change")}</button>
                      <button
                        disabled={busy || nodeDefaultsLoading || !renderModelPicker} type="button"
                        onClick={() => {
                          defaultsEdited.current = true;
                          setLocalNodeDefaults((previous) => { const next = { ...previous }; delete next[kind]; return next; });
                        }}
                        className="text-xs text-neutral-400 hover:text-neutral-200"
                      >{tc("Clear")}</button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-neutral-400">{tc("None set (select on first use)")}</span>
                      <button
                        disabled={busy || nodeDefaultsLoading || !renderModelPicker} type="button"
                        onClick={() => setPickerKind(kind)}
                        className="px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded transition-colors"
                      >{tc("Select Model")}</button>
                    </>
                  )}
                </div>
              </div>
            </div>


          ))}
          <button type="button" className="text-xs text-neutral-400 hover:text-neutral-200" disabled={busy || nodeDefaultsLoading} onClick={() => { defaultsEdited.current = true; setLocalNodeDefaults({}); }}>{tc("Reset defaults")}</button>
        </div>}
        {activeTab === "canvas" && (
          <div className="space-y-3">
            <p className="text-xs text-neutral-400">{tc("Configure how you navigate and interact with the canvas.")}</p>
            {/* Pan Mode */}
            <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium text-neutral-100">{tc("Pan Mode")}</span>
                  <p className="text-xs text-neutral-400">
                    {localCanvasSettings.panMode === "space" && tc("Hold Space and drag to pan")}
                    {localCanvasSettings.panMode === "middleMouse" && tc("Click and drag with middle mouse button")}
                    {localCanvasSettings.panMode === "always" && tc("Pan without holding any keys")}
                  </p>
                </div>
                <div className="flex gap-1 p-0.5 bg-neutral-800 rounded-md">
                  {([
                    { value: "space" as const, label: "Space + Drag" },
                    { value: "middleMouse" as const, label: "Middle Mouse" },
                    { value: "always" as const, label: "Always On" },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={localCanvasSettings.panMode === option.value} onClick={() => setLocalCanvasSettings({ ...localCanvasSettings, panMode: option.value })}
                      className={`flex-1 px-2 py-1.5 text-xs rounded transition-all duration-150 ${
                        localCanvasSettings.panMode === option.value
                          ? "bg-neutral-700 text-neutral-100 font-medium"
                          : "text-neutral-400 hover:text-neutral-300"
                      }`}
                    >
                      {tc(option.label)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Zoom Mode */}
            <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium text-neutral-100">{tc("Zoom Mode")}</span>
                  <p className="text-xs text-neutral-400">
                    {localCanvasSettings.zoomMode === "altScroll" && tc("Hold Alt and scroll to zoom")}
                    {localCanvasSettings.zoomMode === "ctrlScroll" && tc("Hold Ctrl/Cmd and scroll to zoom")}
                    {localCanvasSettings.zoomMode === "scroll" && tc("Scroll to zoom without modifier keys")}
                  </p>
                </div>
                <div className="flex gap-1 p-0.5 bg-neutral-800 rounded-md">
                  {([
                    { value: "altScroll" as const, label: "Alt + Scroll" },
                    { value: "ctrlScroll" as const, label: "Ctrl + Scroll" },
                    { value: "scroll" as const, label: "Scroll" },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={localCanvasSettings.zoomMode === option.value} onClick={() => setLocalCanvasSettings({ ...localCanvasSettings, zoomMode: option.value })}
                      className={`flex-1 px-2 py-1.5 text-xs rounded transition-all duration-150 ${
                        localCanvasSettings.zoomMode === option.value
                          ? "bg-neutral-700 text-neutral-100 font-medium"
                          : "text-neutral-400 hover:text-neutral-300"
                      }`}
                    >
                      {tc(option.label)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Selection Mode */}
            <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium text-neutral-100">{tc("Selection Mode")}</span>
                  <p className="text-xs text-neutral-400">
                    {localCanvasSettings.selectionMode === "click" && tc("Click to select nodes")}
                    {localCanvasSettings.selectionMode === "altDrag" && tc("Hold Alt and drag to select")}
                    {localCanvasSettings.selectionMode === "shiftDrag" && tc("Hold Shift and drag to select")}
                  </p>
                </div>
                <div className="flex gap-1 p-0.5 bg-neutral-800 rounded-md">
                  {([
                    { value: "click" as const, label: "Click" },
                    { value: "altDrag" as const, label: "Alt + Drag" },
                    { value: "shiftDrag" as const, label: "Shift + Drag" },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={localCanvasSettings.selectionMode === option.value} onClick={() => setLocalCanvasSettings({ ...localCanvasSettings, selectionMode: option.value })}
                      className={`flex-1 px-2 py-1.5 text-xs rounded transition-all duration-150 ${
                        localCanvasSettings.selectionMode === option.value
                          ? "bg-neutral-700 text-neutral-100 font-medium"
                          : "text-neutral-400 hover:text-neutral-300"
                      }`}
                    >
                      {tc(option.label)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        </div>

        {/* Fixed footer */}
        <div className="flex justify-end gap-2 px-8 py-5 border-t border-neutral-700/50 shrink-0">
          <CanvasButton onClick={()=>closeRef.current()} disabled={busy}>{tc("Cancel")}</CanvasButton>
          <CanvasButton primary onClick={handleSave} disabled={conflict || busy || nodeDefaultsLoading || !name.trim()}>{busy ? tc("Saving...") : tc("Save")}</CanvasButton>
        </div>

      {pickerKind && renderModelPicker?.(pickerKind, (id) => {
        if (!models.some((model) => model.id === id && model.mediaKind === pickerKind)) return;
        defaultsEdited.current = true;
        setLocalNodeDefaults((previous) => ({ ...previous, [pickerKind]: id }));
        setPickerKind(null);
      }, () => setPickerKind(null))}
    </CanvasDialog>
  );
}
