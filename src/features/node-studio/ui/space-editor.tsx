"use client";

import { useMemo, type ReactNode } from "react";
import type { SpaceEditorSession } from "../model/space-editor-store";
import type { SpaceInputRuntime } from "../model/space-editor-inputs";
import type { SpaceCanvasSettings } from "../model/space-editor-types";
import { createSpaceEditorScope, SpaceEditorProvider, type SpaceEditorCatalog, type SpaceEditorServices } from "./space-editor-provider";
import { SpaceInputMediaProvider } from "./space-input-media-provider";
import { useSpaceMediaServices } from "./space-media-tools";
import { SpaceCanvas } from "./space-canvas";
import { SpaceNode } from "./nodes/space-node";
import { useSpaceModelServices } from "./space-model-tools";
import { SpaceNodeInspector } from "./space-node-inspector";
import { useSpaceMediaDownload } from "../hook/use-space-media-download";
import { useSpaceOperationError } from "../hook/use-space-operation-error";

const noServices: SpaceEditorServices = {};
export function SpaceEditor({ session, catalog, services = noServices, inputRuntime, settings, children, className }: {
  session: SpaceEditorSession; catalog?: SpaceEditorCatalog; services?: SpaceEditorServices; inputRuntime?: SpaceInputRuntime;
  settings?: SpaceCanvasSettings; children?: ReactNode; className?: string;
}) {
  const scope = useMemo(() => createSpaceEditorScope(session), [session]);
  const media = useSpaceMediaServices(scope);
  const models = useSpaceModelServices(scope);
  const downloads = useSpaceMediaDownload(scope);
  const reportError = useSpaceOperationError();
  const combined = useMemo<SpaceEditorServices>(() => ({ ...services, onError: services.onError ?? reportError, renderNode: SpaceNode,
    runNode: services.runNode ? nodeId => {
      if (!scope.prepareNodeRun(nodeId)) throw new Error("NODE_INPUT_CHANGED");
      return services.runNode!(nodeId);
    } : undefined,
    createNode: services.createNode ?? models.createNode, createConnectedNode: models.createConnectedNode, browseModel: models.browseModel,
    filesDrop: media.filesDrop, captureVideoFrame: media.captureVideoFrame, openMediaDetail: media.openMediaDetail, portMediaRequest: media.portMediaRequest,
    downloadSelected: services.downloadSelected ?? downloads.downloadSelected, downloadingSelected: downloads.downloadingSelected }), [scope, services, reportError, media.filesDrop, media.captureVideoFrame, media.openMediaDetail, media.portMediaRequest, models.createNode, models.createConnectedNode, models.browseModel, downloads.downloadSelected, downloads.downloadingSelected]);
  return <SpaceEditorProvider session={session} scope={scope} catalog={catalog} services={combined} inputRuntime={inputRuntime}>
    <SpaceInputMediaProvider controller={media.controller}>
      <SpaceCanvas settings={settings} className={className}>{children}</SpaceCanvas>
      {media.tools}
      {models.tools}
      <SpaceNodeInspector />
    </SpaceInputMediaProvider>
  </SpaceEditorProvider>;
}
