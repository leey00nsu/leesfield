"use client";

import type { SpaceEditorSession } from "../model/space-editor-store";
import type { SpaceInputRuntime } from "../model/space-editor-inputs";
import type { SpaceCanvasSettings } from "../model/space-editor-types";
import { SpaceEditor } from "./space-editor";
import type { SpaceEditorCatalog, SpaceEditorServices } from "./space-editor-provider";

export function NodeStudio({ session, catalog, inputRuntime, canvasSettings, services }: {
  session: SpaceEditorSession; catalog?: SpaceEditorCatalog; inputRuntime?: SpaceInputRuntime; canvasSettings?: SpaceCanvasSettings; services?: SpaceEditorServices;
}) {
  return <SpaceEditor session={session} catalog={catalog} inputRuntime={inputRuntime} settings={canvasSettings} services={services} />;
}
