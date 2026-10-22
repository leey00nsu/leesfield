"use client";

import { useTranslations } from "next-intl";
import { useMediaAsset } from "@/features/media-assets/hook/use-media-assets";
import { isUnavailableEditNodeKind } from "@/shared/generation-graph/node-availability";
import { findNodeDefinition, validateNodeConfig } from "@/shared/generation-graph/node-registry";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { useSpaceEditor, useSpaceInputRevision, useSpaceSelector } from "../space-editor-provider";
import { SpaceMediaPreview } from "./space-media-preview";
import { SpaceNodeFrame } from "./space-node-frame";
import styles from "./space-node-retired.module.css";

type SavedResult = { assetId: string; portId: string | null; sortOrder: number | null };

function SavedMedia({ nodeId, result, selectedAssetId, selected, hovered, zoom }: {
  nodeId: string; result: SavedResult; selectedAssetId: string | null; selected: boolean; hovered: boolean; zoom: number;
}) {
  const scope = useSpaceEditor(), query = useMediaAsset(result.assetId), t = useTranslations("nodeStudio.mediaNodes"), tc = useCanvasTranslation();
  return <div className={styles.result} data-saved-asset={result.assetId} data-output-port={result.portId ?? undefined}
    data-output-index={result.sortOrder ?? undefined} data-selected-output={result.assetId === selectedAssetId}>
    {query.data ? <SpaceMediaPreview asset={query.data} selected={selected} hovered={hovered} zoom={zoom}
      onOpen={(asset, trigger, onClosed) => scope.view.getState().services.openMediaDetail?.(nodeId, asset, trigger, onClosed)} />
      : <p className={styles.placeholder} role="status">{query.isError ? t("loadError") : t("loading")}</p>}
    {query.isError && <div className={styles.error} role="alert">{t("loadError")}
      <button type="button" className="nodrag nopan" onPointerDown={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); void query.refetch(); }}>{tc("Retry")}</button>
    </div>}
  </div>;
}

/** Preserve opaque saved content. Only the node's durable results are previewed. */
export function SpaceRetiredNode({ nodeId }: { nodeId: string }) {
  const scope = useSpaceEditor(), t = useTranslations("nodeStudio"), tc = useCanvasTranslation();
  const node = useSpaceSelector(state => state.nodeById.get(nodeId));
  const selected = useSpaceSelector(state => state.selectedNodeIds.includes(nodeId));
  const hovered = useSpaceSelector(state => state.hoveredNodeId === nodeId);
  const zoom = useSpaceSelector(state => state.viewport.zoom);
  const readOnlyReason = useSpaceSelector(state => state.readOnlyReason);
  useSpaceInputRevision(nodeId);
  if (!node) return null;
  const support = validateNodeConfig(node.kind, node.configVersion, node.config);
  const reason = !support.supported ? support.reason : isUnavailableEditNodeKind(node.kind) ? "NODE_UNAVAILABLE" : "UNSUPPORTED_NODE";
  const ports = findNodeDefinition(node.kind)?.ports.filter(port => port.direction === "output") ?? [];
  // Copy before sorting; never mutate bindings or interpret/normalize raw config.
  const bindings = [...(scope.getInputRuntime().mediaOutputs?.get(nodeId) ?? [])]
    .sort((left, right) => ports.findIndex(port => port.id === left.portId) - ports.findIndex(port => port.id === right.portId)
      || left.sortOrder - right.sortOrder);
  const results: SavedResult[] = bindings.flatMap(binding => binding.assetId
    ? [{ assetId: binding.assetId, portId: binding.portId, sortOrder: binding.sortOrder }] : []);
  if (node.selectedOutputAssetId && !results.some(result => result.assetId === node.selectedOutputAssetId)) {
    results.unshift({ assetId: node.selectedOutputAssetId, portId: null, sortOrder: null });
  }
  return <SpaceNodeFrame nodeId={nodeId} contentClassName={styles.content}>
    <div className={styles.body} data-space-retired={node.kind}>
      <p className={styles.reason} role="status">{t("runtime.unsupportedDescription", { reason })}</p>
      {readOnlyReason && <p className={styles.readOnly}>{t("runtime.readOnly", { reason: readOnlyReason })}</p>}
      {!findNodeDefinition(node.kind) && <code className={styles.kind}>{tc("Unsupported node")}: {node.kind}</code>}
      {results.length ? <div className={`${styles.results} nowheel`}>
        {results.map((result, index) => <SavedMedia key={JSON.stringify([result.portId, result.sortOrder, result.assetId, index])}
          nodeId={nodeId} result={result} selectedAssetId={node.selectedOutputAssetId} selected={selected} hovered={hovered} zoom={zoom} />)}
      </div> : <p className={styles.placeholder}>{t("mediaNodes.outputEmpty")}</p>}
    </div>
  </SpaceNodeFrame>;
}
