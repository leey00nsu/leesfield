"use client";

import { useId } from "react";
import { memoBackgroundColorSchema, validateNodeConfig } from "@/shared/generation-graph/node-registry";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { useSpaceEditor, useSpaceSelector } from "./space-editor-provider";

/** Inspector contents; the caller owns the shared inspector panel. */
export function SpaceMemoInspector({ nodeId }: { nodeId: string }) {
  const scope = useSpaceEditor(), tc = useCanvasTranslation(), id = useId();
  const node = useSpaceSelector(state => state.nodeById.get(nodeId));
  const writable = useSpaceSelector(state => state.writable);
  if (!node || node.kind !== "note.memo") return null;
  const config: Record<string, unknown> = node.config !== null && typeof node.config === "object" && !Array.isArray(node.config) ? node.config : {};
  const parsed = memoBackgroundColorSchema.safeParse(config.backgroundColor);
  const disabled = !writable || !validateNodeConfig(node.kind, node.configVersion, node.config).supported;
  const publish = (color?: string) => {
    const state = scope.session.getSnapshot(), current = state.nodeById.get(nodeId);
    if (!state.writable || current?.kind !== "note.memo" || !validateNodeConfig(current.kind, current.configVersion, current.config).supported
      || (color !== undefined && !memoBackgroundColorSchema.safeParse(color).success)) return;
    const result = scope.session.dispatch({ type: "node.config.fields", nodeId,
      changes: [color === undefined ? { path: ["backgroundColor"], remove: true } : { path: ["backgroundColor"], value: color }] });
    if (!result.ok) scope.view.getState().services.onError?.(new Error(result.message));
  };
  return <div className="space-y-2" role="group" aria-label={tc("Memo background color")}>
    <label htmlFor={id} className="block text-xs text-neutral-400">{tc("Background color")}</label>
    <div className="flex items-center gap-2">
      <AppInput id={id} type="color" value={parsed.success ? parsed.data : "#171717"} disabled={disabled}
        className="h-10 w-14 cursor-pointer p-1" onChange={event => publish(event.target.value)} />
      <AppButton type="button" variant="surface" size="sm" disabled={disabled || config.backgroundColor === undefined}
        onClick={() => publish()}>{tc("Use default color")}</AppButton>
    </div>
  </div>;
}
