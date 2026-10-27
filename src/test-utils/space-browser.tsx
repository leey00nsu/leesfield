import { act, cleanup, render } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, vi } from "vitest";
import { page } from "vitest/browser";
import { useState, type ReactNode } from "react";
import en from "@/shared/i18n/messages/en.json";
import ko from "@/shared/i18n/messages/ko.json";
import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import type { CanonicalNodeKind } from "@/shared/generation-graph/node-registry";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import { createSpaceEditorSession } from "@/features/node-studio/model/space-editor-store";
import type { SpaceEditorDocument } from "@/features/node-studio/model/space-editor-types";
import type { NodeExecutionDto } from "@/features/node-studio/model/node-execution-types";
import { nodeExecutionKeys } from "@/features/node-studio/hook/use-node-executions";
import { SpaceEditor } from "@/features/node-studio/ui/space-editor";
import type { SpaceEditorCatalog } from "@/features/node-studio/ui/space-editor-provider";
import { NativeStoryProviders, storyMediaAsset } from "@/features/node-studio/ui/native-story-fixtures";
import { SpaceWorkspaceHeader, SpaceCommentsNavigationIcon } from "@/features/node-studio/ui/space-workspace-header";
import { SpaceCommentsContext, useSpaceCommentsSession } from "@/features/node-studio/hook/use-space-comments";
import { defaultSpaceCanvasSettings } from "@/features/node-studio/model/space-editor-types";
import { useSpacePreferences } from "@/features/node-studio/hook/use-space-preferences";
import { AppToaster } from "@/shared/ui/app-toast";
import { imageModel, otherImage, audioModel, videoModel, llm } from "./fixtures/space-generation-models";

export const browserCatalog: SpaceEditorCatalog = { imageModels: [imageModel, otherImage], audioModels: [audioModel],
  videoModels: [videoModel], llmModels: [llm], isLoading: false, error: null, retry: () => {} };
export { imageModel, audioModel, videoModel, llm };
const clients = new Set<QueryClient>();
afterEach(() => { cleanup(); for (const client of clients) client.clear(); clients.clear(); vi.restoreAllMocks(); });

export function node(id: string, kind: CanonicalNodeKind, config?: CanonicalNode["config"], x = 0, y = 0): CanonicalNode {
  return { id, kind, configVersion: 1, position: { x, y }, config: config ?? defaultConfigForKind(kind), selectedOutputAssetId: null };
}
export function intl(children: ReactNode, locale: "en" | "ko" = "en") {
  return <NextIntlClientProvider locale={locale} messages={locale === "ko" ? ko : en}>{children}</NextIntlClientProvider>;
}

export async function mountSpace(options: { nodes: CanonicalNode[]; edges?: SpaceEditorDocument["edges"]; inline?: boolean;
  catalog?: SpaceEditorCatalog; locale?: "en" | "ko"; selected?: string; header?: boolean; executions?: Record<string, NodeExecutionDto[]> } ) {
  const id = "component-space", client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } } });
  clients.add(client);
  const secondImage = document.createElement("canvas"); secondImage.width = 32; secondImage.height = 24;
  const pixels = secondImage.getContext("2d")!; pixels.fillStyle = "#154dc9"; pixels.fillRect(0, 0, 32, 24);
  const assets = [storyMediaAsset("image-a", "image"), { ...storyMediaAsset("image-b", "image"), mimeType: "image/png", url: secondImage.toDataURL("image/png") },
    storyMediaAsset("audio", "audio"), storyMediaAsset("video", "video")];
  for (const asset of assets) client.setQueryData(mediaAssetKeys.detail(asset.id), asset);
  for (const item of options.nodes) client.setQueryData(nodeExecutionKeys.list(id, item.id), options.executions?.[item.id] ?? []);
  const originalFetch = globalThis.fetch.bind(globalThis);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const match = url.pathname.match(/^\/api\/media-assets\/([^/]+)(\/content)?$/);
    if (match) {
      const asset = assets.find(asset => asset.id === decodeURIComponent(match[1]));
      if (!asset) throw new Error("Unknown component asset");
      return match[2] ? originalFetch(asset.url) : Response.json({ asset });
    }
    if (url.pathname.startsWith("/api/")) throw new Error("Unexpected component API: " + url.pathname);
    return originalFetch(input, init);
  });
  const session = createSpaceEditorSession({ id, version: 1, document: { schemaVersion: 3, title: "Component", groups: [],
    nodes: structuredClone(options.nodes), edges: structuredClone(options.edges ?? []) } });
  if (options.selected) session.select([options.selected]);
  const executions = options.executions ?? {};
  for (const [nodeId, values] of Object.entries(executions)) if (values[0]) session.patchRuntime(nodeId, { execution: values[0] });
  render(intl(<NativeStoryProviders client={client} graphId={id} inlineParametersEnabled={options.inline}>
    <div style={{ width: "100vw", height: "100vh" }}><BrowserEditor session={session} catalog={options.catalog ?? browserCatalog} header={options.header} />
      <AppToaster /></div></NativeStoryProviders>, options.locale));
  await page.getByRole("button", { name: /^(Fit View|화면에 맞추기|전체 보기)$/ }).click();
  if (options.selected) { const header = page.elementLocator(document.querySelector(`[data-space-node-id="${options.selected}"] [data-space-node-header]`)!); await header.hover(); await header.click({ position: { x: 1, y: 1 } }); }
  return { session, client, assets, select: (nodeId: string) => act(() => session.select([nodeId])) };
}

function BrowserEditor({ session, catalog, header }: { session: ReturnType<typeof createSpaceEditorSession>; catalog: SpaceEditorCatalog; header?: boolean }) {
  const preferences = useSpacePreferences();
  const [settings, setSettings] = useState(defaultSpaceCanvasSettings);
  const comments = useSpaceCommentsSession("component", session.getDocument().nodes.map(item => ({
    id: item.id, position: item.position, data: { comment: (item.config as { presentation?: { comment?: string } }).presentation?.comment },
  })));
  return <SpaceCommentsContext.Provider value={comments}>
    {header && <SpaceWorkspaceHeader title="Component" graphs={[]} activeGraphId="component-space" saveLabel="Saved"
      onTitleChange={() => {}} onSelectGraph={() => {}} onCreateGraph={() => {}} onSave={() => {}} onDelete={() => {}}
      canvasSettings={settings} onCanvasSettingsChange={setSettings}
      inlineParametersEnabled={preferences?.inlineParametersEnabled} onSaveSettings={async changes => { if (changes.inlineParametersEnabled !== undefined) await preferences?.setInlineParametersEnabled(changes.inlineParametersEnabled); }}
      commentsNavigation={<SpaceCommentsNavigationIcon count={comments.count} unreadCount={comments.unreadCount} onNavigate={comments.navigateFirst} />} />}
    <SpaceEditor session={session} catalog={catalog} settings={settings} services={{ runNode: () => { throw new Error("Unexpected component execution"); } }} />
  </SpaceCommentsContext.Provider>;
}
