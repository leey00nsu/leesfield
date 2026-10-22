import { useCallback, useMemo, useState, useSyncExternalStore, type ContextType, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { emptySpacePreferences } from "@/shared/generation-graph/space-preferences";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { CanvasProviders } from "@/shared/ui/canvas-providers";
import { SpacePreferencesContext } from "../hook/use-space-preferences";
import { nodeExecutionKeys } from "../hook/use-node-executions";
import { NodeExecutionReadContext } from "../model/node-execution-read-context";
import type { NodeExecutionDto } from "../model/node-execution-types";
import type { SpaceEditorSession } from "../model/space-editor-store";

export const storyDate = "2026-10-20T00:00:00Z";

export function storyMediaAsset(id: string, type: "image" | "video" | "audio"): MediaAssetDto {
  const media = type === "image" ? { url: "/assets/storybook/puppy.jpg", mimeType: "image/jpeg", width: 640, height: 462, durationMs: null }
    : type === "video" ? { url: "/assets/storybook/puppy.mp4", mimeType: "video/mp4", width: 640, height: 462, durationMs: 2000 }
      : { url: "/assets/storybook/tone.wav", mimeType: "audio/wav", width: null, height: null, durationMs: 1000 };
  return { id, type, ...media, version: 1, status: "completed", origin: "upload", bytes: null, sourceOperationId: null, createdAt: storyDate, updatedAt: storyDate };
}

/** Story output follows the same durable subscription as workspace autosave. */
export function useStoryDocument(session: SpaceEditorSession) {
  const subscribe = useCallback((notify: () => void) => session.subscribeDurable(() => notify()), [session]);
  return useSyncExternalStore(subscribe, session.getDocument, session.getDocument);
}

/** Local owners and history reads keep these authoring fixtures independent of APIs. */
export function NativeStoryProviders({ client, graphId, inlineParametersEnabled = false, children }: {
  client: QueryClient; graphId: string; inlineParametersEnabled?: boolean; children: ReactNode;
}) {
  const [preferences, setPreferences] = useState(() => ({ ...emptySpacePreferences(), inlineParametersEnabled }));
  const owner = useMemo<NonNullable<ContextType<typeof SpacePreferencesContext>>>(() => ({
    data: preferences, error: null, saving: false, retry: () => {},
    inlineParametersEnabled: preferences.inlineParametersEnabled,
    trackModel: key => setPreferences(value => ({ ...value, recentModelKeys: [key, ...value.recentModelKeys.filter(item => item !== key)].slice(0, 20) })),
    saveDefaults: async defaults => setPreferences(value => ({ ...value, defaults })),
    saveSettings: async changes => setPreferences(value => ({ ...value, ...changes })),
    setInlineParametersEnabled: async enabled => setPreferences(value => ({ ...value, inlineParametersEnabled: enabled })),
  }), [preferences]);
  const reader = useMemo(() => ({ graphId, read: async (nodeId: string) => client.getQueryData<NodeExecutionDto[]>(nodeExecutionKeys.list(graphId, nodeId)) ?? [] }), [client, graphId]);
  return <QueryClientProvider client={client}><CanvasProviders><SpacePreferencesContext.Provider value={owner}>
    <NodeExecutionReadContext.Provider value={reader}>{children}</NodeExecutionReadContext.Provider>
  </SpacePreferencesContext.Provider></CanvasProviders></QueryClientProvider>;
}
