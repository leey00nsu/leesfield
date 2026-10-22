"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downloadMediaZip } from "../lib/media-zip-download";
import { selectedSpaceMediaAssetIds } from "../model/space-editor-output";
import type { SpaceEditorScope } from "../ui/space-editor-provider";

/** Own one bounded download, cancelled on readonly, reset, disposal or Space change. */
export function useSpaceMediaDownload(scope: SpaceEditorScope) {
  const current = useRef<{ controller: AbortController; epoch: number } | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const invalidate = () => {
      const operation = current.current, state = scope.session.getSnapshot();
      if (operation && (state.disposed || !state.writable || scope.view.getState().epoch !== operation.epoch)) {
        current.current = null; operation.controller.abort(); setPending(false);
      }
    };
    const stateSubscription = scope.session.store.subscribe(invalidate), viewSubscription = scope.view.subscribe(invalidate);
    return () => { stateSubscription(); viewSubscription(); current.current?.controller.abort(); current.current = null; };
  }, [scope]);
  const downloadSelected = useCallback(async () => {
    const state = scope.session.getSnapshot();
    if (state.disposed || !state.writable || current.current) return;
    const operation = { controller: new AbortController(), epoch: scope.view.getState().epoch };
    current.current = operation; setPending(true);
    const timer = setTimeout(() => operation.controller.abort(new Error("Media ZIP download timed out. Please retry.")), 90_000);
    try { await downloadMediaZip(selectedSpaceMediaAssetIds(state.document, scope.inputs, state.selectedNodeIds), operation.controller.signal); }
    catch (error) {
      if (current.current === operation) scope.view.getState().services.onError?.(error instanceof Error ? error : new Error("Media ZIP download failed."));
    } finally {
      clearTimeout(timer);
      if (current.current === operation) { current.current = null; setPending(false); }
    }
  }, [scope]);
  return { downloadSelected, downloadingSelected: pending };
}
