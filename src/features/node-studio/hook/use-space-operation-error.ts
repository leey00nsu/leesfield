"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { logger } from "@/shared/logging/logger.mjs";
import { appToast } from "@/shared/ui/app-toast";
import { spaceOperationErrorMessage } from "../model/space-operation-error";

/** Error identity joins nested catch boundaries; event keys join repeated reads of one execution. */
export function useSpaceOperationError() {
  const tc = useCanvasTranslation(), alive = useRef(false);
  const seen = useRef(new WeakSet<object>()), events = useRef(new Set<string>());
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return useCallback((error: unknown, eventKey?: string) => {
    if (!alive.current) return;
    const message = spaceOperationErrorMessage(error);
    if (!message || error instanceof Error && seen.current.has(error) || eventKey && events.current.has(eventKey)) return;
    if (error instanceof Error) seen.current.add(error);
    if (eventKey) {
      events.current.add(eventKey);
      if (events.current.size > 128) events.current.delete(events.current.values().next().value!);
    }
    logger.error("space.operation_failed", error);
    appToast.error(tc(message));
  }, [tc]);
}
