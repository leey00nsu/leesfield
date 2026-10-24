"use client";
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import { historyKeys } from "@/features/generation-history/hook/use-history-query";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { directMediaEditApi } from "../api/direct-media-edit-api";
import { createSpaceMediaEditController, type MediaEditDraft, type SpaceMediaEditController } from "../model/space-media-edit-controller";
import { useSpaceEditor } from "./space-editor-provider";

const Context = createContext<SpaceMediaEditController | null>(null);
export function SpaceMediaEditProvider({ children }: { children: ReactNode }) {
  const scope = useSpaceEditor(), queryClient = useQueryClient(), ko = useLocale() === "ko";
  const controller = useMemo(() => createSpaceMediaEditController({ session: scope.session, api: directMediaEditApi,
    prepare: () => {
      const prepare = scope.view.getState().services.prepareNodeExecution;
      return prepare ? prepare() : Promise.reject(new Error("EDIT_SAVE_UNAVAILABLE"));
    }, epoch: () => scope.view.getState().epoch, revision: id => scope.inputs.inputRevision(id),
    asset: id => queryClient.getQueryData<MediaAssetDto>(mediaAssetKeys.detail(id)),
    onComplete: () => { void queryClient.invalidateQueries({ queryKey: mediaAssetKeys.all }); void queryClient.invalidateQueries({ queryKey: historyKeys.all }); },
    onError: error => scope.view.getState().services.onError?.(new Error(
      error.message === "PROCESSOR_UNAVAILABLE" ? ko ? "현재 미디어 편집을 사용할 수 없습니다." : "Media editing is currently unavailable."
      : ["EDIT_SOURCE_CHANGED", "GRAPH_VERSION_CONFLICT"].includes(error.message) ? ko ? "원본이나 작업 공간이 바뀌었습니다. 다시 선택해 주세요." : "The source or Space changed. Please select it again."
      : ko ? "미디어 편집을 시작하지 못했습니다. 다시 시도해 주세요." : "Could not start editing. Please try again.")),
  }), [scope, queryClient, ko]);
  const lifetime = useRef<{ controller: SpaceMediaEditController } | null>(null);
  useEffect(() => {
    const ticket = { controller }; lifetime.current = ticket; controller.start();
    return () => {
      // React Strict Mode replays effects without leaving the Space.
      queueMicrotask(() => {
        if (lifetime.current === ticket || lifetime.current?.controller !== controller) controller.dispose();
      });
    };
  }, [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export const useSpaceMediaEdit = () => useContext(Context);
export function useSpaceMediaEditDraft() {
  const controller = useSpaceMediaEdit();
  // A stable inert store permits existing isolated node/toolbar tests without a provider.
  return useStore(controller?.store ?? empty, state => state.draft);
}
const empty = createStore<{ draft: MediaEditDraft | null }>(() => ({ draft: null }));
