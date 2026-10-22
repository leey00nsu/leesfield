"use client";

/* Resize controls/layout adapted from Node Banana's ImageResizeNode.
 * MIT License
 * Copyright (c) 2026 William Falloon
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { useTranslations } from "next-intl";
import { useMediaAsset } from "@/features/media-assets/hook/use-media-assets";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { AppButton } from "@/shared/ui/app-button";
import { useSpaceEditor, useSpaceResolvedInput, useSpaceSelector } from "../space-editor-provider";
import { SpaceMediaPreview } from "./space-media-preview";
import { SpaceMediaClearButton } from "./space-media-clear-button";
import { SpaceNodeFrame } from "./space-node-frame";
import styles from "./space-node-resize.module.css";

/** Settings live in the inspector; Frame/workspace own all execution. */
export function SpaceResizeNode({ nodeId }: { nodeId: string }) {
  const scope = useSpaceEditor(), tc = useCanvasTranslation(), t = useTranslations("nodeStudio");
  const node = useSpaceSelector(state => state.nodeById.get(nodeId));
  const selected = useSpaceSelector(state => state.selectedNodeIds.includes(nodeId)), hovered = useSpaceSelector(state => state.hoveredNodeId === nodeId);
  const zoom = useSpaceSelector(state => state.viewport.zoom), runtime = useSpaceSelector(state => state.runtimeByNode.get(nodeId));
  const validKind = node?.kind === "edit.image.resize";
  const inputId = useSpaceResolvedInput(nodeId, inputs => validKind ? inputs.inputAssetIds(nodeId, "image")[0] ?? null : null);
  const source = useMediaAsset(inputId);
  const execution = runtime?.execution?.executionKind === "media_operation" && runtime.execution.graphNodeId === nodeId && runtime.execution.mediaType === "image"
    ? runtime.execution : undefined;
  const active = Boolean(execution && ["pending", "processing", "uploading"].includes(execution.status));
  if (node?.kind !== "edit.image.resize") return null;
  return <SpaceNodeFrame nodeId={nodeId} fullBleed contentClassName={styles.content}>
    <div className={styles.body} data-space-resize="" aria-busy={active}>
      {/* Automatic result Inputs display durable results; this preview always follows the image input. */}
      <div className={styles.preview}>
        <SpaceMediaClearButton nodeId={nodeId} portIds={["image"]} />
        {source.data?.type === "image" ? <SpaceMediaPreview asset={source.data} selected={selected} hovered={hovered} zoom={zoom} imageFit="contain"
          onOpen={(asset, trigger, onClosed) => scope.view.getState().services.openMediaDetail?.(nodeId, asset, trigger, onClosed)} />
          : <span className={styles.empty}>{inputId ? t("mediaNodes.loading") : tc("Connect an image")}</span>}
      </div>
      <div className={styles.feedbacks}>
        {inputId && source.isError && <div role="alert" className={`${styles.error} nodrag nopan nowheel`}>
          {t("mediaNodes.loadError")}<AppButton type="button" variant="ghost" size="sm" onClick={() => { void source.refetch(); }}>{tc("Retry")}</AppButton>
        </div>}
        {execution?.status === "failed" && <div className={styles.feedback} role="alert">
          <span>{t("execution.status.failed")}</span>
        </div>}
      </div>
    </div>
  </SpaceNodeFrame>;
}
