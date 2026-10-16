"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { droppedMediaType, normalizeDroppedMediaFile } from "@/shared/media-assets/media-file-drop";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { patchAssetMetadata, uploadMediaAsset } from "../api/media-asset-api";
import { mediaAssetKeys } from "./use-media-assets";
export type LibraryUpload = { id: string; file: File; preview: string; projectId: string | null; status: "uploading" | "failed" | "cancelled" | "completed"; error?: unknown; asset?: MediaAssetDto; placementFailed?: boolean };
export function useAssetLibraryUploads() {
  const client = useQueryClient();
  const [uploads, setUploads] = useState<LibraryUpload[]>([]);
  const items = useRef(new Map<string, LibraryUpload>());
  const controllers = useRef(new Map<string, AbortController>());
  const mounted = useRef(true);
  const queue = useRef<Array<{ id: string; controller: AbortController }>>([]);
  const active = useRef(0);
  const update = useCallback((id: string, patch: Partial<LibraryUpload>) => {
    const current = items.current.get(id); if (!current || !mounted.current) return;
    items.current.set(id, { ...current, ...patch }); setUploads([...items.current.values()]);
  }, []);
  const remove = useCallback((id: string) => {
    controllers.current.get(id)?.abort(); controllers.current.delete(id);
    const entry = items.current.get(id); if (entry?.preview) URL.revokeObjectURL(entry.preview);
    items.current.delete(id); if (mounted.current) setUploads([...items.current.values()]);
  }, []);
  const drain = useRef<() => void>(() => {});
  drain.current = () => {
    while (mounted.current && active.current < 2 && queue.current.length) {
      const { id, controller } = queue.current.shift()!;
      const entry = items.current.get(id);
      if (!entry || controllers.current.get(id) !== controller || controller.signal.aborted) continue;
      active.current++;
      void (async () => {
        try {
          let asset = await uploadMediaAsset(entry.file, droppedMediaType(entry.file.type)!, undefined, controller.signal);
          if (!controller.signal.aborted && entry.projectId) {
            try { asset = await patchAssetMetadata(asset.id, { expectedVersion: asset.version, projectIds: [...new Set([...(asset.projectIds ?? []), entry.projectId])] }); }
            catch { update(id, { status: "completed", asset, placementFailed: true }); await client.invalidateQueries({ queryKey: mediaAssetKeys.all }); return; }
          }
          if (!mounted.current || controller.signal.aborted || controllers.current.get(id) !== controller) {
            await client.invalidateQueries({ queryKey: mediaAssetKeys.all }); return;
          }
          update(id, { status: "completed", asset });
          client.setQueryData(mediaAssetKeys.detail(asset.id), asset);
          await client.invalidateQueries({ queryKey: mediaAssetKeys.all });
          remove(id);
        } catch (error) {
          if (controllers.current.get(id) === controller) update(id, { status: controller.signal.aborted ? "cancelled" : "failed", error });
        } finally {
          if (controllers.current.get(id) === controller) controllers.current.delete(id);
          active.current--; drain.current();
        }
      })();
    }
  };
  const add = useCallback((files: readonly File[], projectId: string | null) => {
    let rejected = 0;
    for (const original of files) {
      const file = normalizeDroppedMediaFile(original); if (!file) { rejected++; continue; }
      const id = crypto.randomUUID();
      items.current.set(id, { id, file, projectId, preview: URL.createObjectURL(file), status: "uploading" });
      const controller = new AbortController(); controllers.current.set(id, controller); queue.current.push({ id, controller });
    }
    setUploads([...items.current.values()]); drain.current(); return rejected;
  }, []);
  const cancel = (id: string) => { controllers.current.get(id)?.abort(); controllers.current.delete(id); update(id, { status: "cancelled" }); };
  const retry = (id: string) => {
    if (!items.current.has(id) || controllers.current.has(id)) return;
    const controller = new AbortController(); controllers.current.set(id, controller); update(id, { status: "uploading", error: undefined }); queue.current.push({ id, controller }); drain.current();
  };
  useEffect(() => { mounted.current = true; const requests = controllers.current, entries = items.current; return () => { mounted.current = false; for (const item of requests.values()) item.abort(); for (const entry of entries.values()) URL.revokeObjectURL(entry.preview); }; }, []);
  return { uploads, add, cancel, retry, remove };
}
