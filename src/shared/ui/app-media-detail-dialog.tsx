"use client";

import { createContext, useContext, useRef, type ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import { AppDialog, AppDialogContent } from "./app-dialog";
import { useUnsavedChangesGuard } from "./use-unsaved-changes-guard";

const DetailCloseContext = createContext<(() => void) | null>(null);
export function useMediaDetailDialog(onClose: () => void, busy = false) {
  return { ...useUnsavedChangesGuard(onClose, busy), busy };
}
type DetailController = ReturnType<typeof useMediaDetailDialog>;

/** Full-screen media/text/job details share dismissal and nested-layer handling. */
export function AppMediaDetailDialog({ controller, open = true, children, className, onKeyDownCapture, ...props }:
  Omit<ComponentProps<typeof AppDialogContent>, "size" | "surface" | "padding" | "showCloseButton"> & {
    controller: DetailController; open?: boolean;
  }) {
  const composing = useRef(false);
  return <>
    <AppDialog open={open} onOpenChange={(next, details) => {
      if (next) return;
      if (controller.confirming) return;
      details.cancel();
      const event = details.event;
      if (composing.current || (event instanceof KeyboardEvent && (event.isComposing || event.keyCode === 229))) return;
      controller.requestClose();
    }}>
      <AppDialogContent size="full" surface="media" padding="none" showCloseButton={false}
        overlayClassName="z-[10009]" aria-describedby={undefined}
        className={cn("nodrag nopan nowheel z-[10010] grid h-dvh gap-0 overflow-hidden", className)}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
        onKeyDownCapture={event => {
          if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) { event.stopPropagation(); return; }
          const target = event.target instanceof Element ? event.target : null;
          const nested = target?.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]');
          if (nested && nested !== event.currentTarget) return;
          if (event.key === "Escape") {
            if ([...event.currentTarget.querySelectorAll('[aria-expanded="true"][aria-controls]')]
              .some(trigger => document.getElementById(trigger.getAttribute("aria-controls") ?? ""))) return;
            event.preventDefault(); event.stopPropagation(); controller.requestClose(); return;
          }
          onKeyDownCapture?.(event);
        }} {...props}>
        <DetailCloseContext.Provider value={controller.requestClose}>{children}</DetailCloseContext.Provider>
      </AppDialogContent>
    </AppDialog>
    {controller.confirmation}
  </>;
}

/** Layout wrappers stay transparent to background clicks; actual content opts out. */
export function AppMediaDetailBackdrop({ onClick, ...props }: ComponentProps<"div">) {
  const close = useContext(DetailCloseContext);
  return <div data-app-media-detail-backdrop="" {...props} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-app-media-detail-content],button,a,input,textarea,select,[contenteditable="true"],[role="menu"],[role="listbox"],[role="alertdialog"]')) return;
    close?.();
  }} />;
}
