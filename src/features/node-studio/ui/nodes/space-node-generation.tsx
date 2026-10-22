"use client";

import { useId, type ComponentProps } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { AppButton } from "@/shared/ui/app-button";
import { useNodeExecutions } from "../../hook/use-node-executions";
import { useSpacePreferences } from "../../hook/use-space-preferences";
import { useNodeAuthoring } from "../../model/node-authoring-context";
import type { NodeExecutionDto } from "../../model/node-execution-types";
import type { SpaceNodeRuntime } from "../../model/space-editor-types";
import { useSpaceEditor, useSpaceResolvedInput, useSpaceSelector, useSpaceViewSelector } from "../space-editor-provider";
import { GenerationNodeParameterControls } from "./generation-node-parameter-controls";
import { SpaceGenerationPrompt } from "./space-generation-prompt";
import { SpaceNodeFrame } from "./space-node-frame";
import styles from "./space-node-generation.module.css";

type RepeatProgress = NonNullable<ComponentProps<typeof SpaceGenerationPrompt>["progress"]>;
type GenerationRuntime = SpaceNodeRuntime & { repeatProgress?: RepeatProgress };
const activeStatuses = new Set(["pending", "processing", "uploading"]);
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function latestExecution(runtime: NodeExecutionDto | undefined, records: readonly NodeExecutionDto[]) {
  const latest = records.reduce<NodeExecutionDto | undefined>((last, row) => !last || row.createdAt > last.createdAt ? row : last, undefined);
  if (!runtime) return latest;
  if (!latest || runtime.createdAt > latest.createdAt) return runtime;
  if (runtime.executionId !== latest.executionId) return latest;
  if (activeStatuses.has(runtime.status) && !activeStatuses.has(latest.status)) return latest;
  return runtime;
}

/** The dispatcher supplies the scoped authoring bridge; execution belongs to the Frame/workspace. */
export function SpaceGenerationNode({ nodeId }: { nodeId: string }) {
  const scope = useSpaceEditor(), authoring = useNodeAuthoring(), preferences = useSpacePreferences();
  const tc = useCanvasTranslation(), t = useTranslations("nodeStudio"), settingsId = useId();
  const node = useSpaceSelector(state => state.nodeById.get(nodeId));
  const graphId = useSpaceSelector(state => state.id), persisted = useSpaceSelector(state => state.persistedNodeIds.has(nodeId));
  const disposed = useSpaceSelector(state => state.disposed);
  const writable = useSpaceSelector(state => state.writable);
  const runtime = useSpaceSelector(state => state.runtimeByNode.get(nodeId)) as GenerationRuntime | undefined;
  const catalog = useSpaceViewSelector(state => state.catalog), expanded = useSpaceViewSelector(state => state.expandedNodeIds.has(nodeId));
  const modality = node?.kind === "generate.audio" ? "audio" : node?.kind === "generate.video" ? "video" : "image";
  const validKind = node?.kind === "generate.image" || node?.kind === "generate.audio" || node?.kind === "generate.video";
  const history = useNodeExecutions(graphId, nodeId, persisted && validKind && !disposed);
  const records = (history.data ?? []).filter(row => row.executionKind === "generation" && row.mediaType === modality && row.graphNodeId === nodeId);
  const execution = latestExecution(runtime?.execution?.executionKind === "generation" && runtime.execution.mediaType === modality && runtime.execution.graphNodeId === nodeId ? runtime.execution : undefined, records);
  const config = record(node?.config), parameters = record(config.parameters);
  const models = modality === "image" ? catalog.imageModels : modality === "audio" ? catalog.audioModels ?? [] : catalog.videoModels ?? [];
  const model = models.find(candidate => candidate.key === config.modelKey);
  const connection = useSpaceResolvedInput(nodeId, inputs => inputs.promptInput(nodeId));
  const inline = preferences?.inlineParametersEnabled ?? false;
  if (!node || !validKind) return null;
  const settings = inline ? <div className={styles.settings} data-expanded={expanded}>
    <AppButton type="button" variant="ghost" size="sm" className={styles.settingsToggle}
      aria-expanded={expanded} aria-controls={settingsId} onClick={() => scope.toggleExpanded(nodeId)}>
      {tc("Settings")}{expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
    </AppButton>
    {expanded && <div id={settingsId} className={styles.parameters}>
      {model ? <GenerationNodeParameterControls model={model} values={parameters} disabled={!writable}
        onChange={next => {
          if (scope.session.getSnapshot().writable) authoring.updateCanonicalNodeConfig?.(nodeId, { ...config, parameters: next } as Parameters<NonNullable<typeof authoring.updateCanonicalNodeConfig>>[1]);
        }} /> : <p role="status">{typeof config.modelKey === "string" ? t("node.modelUnavailable", { model: config.modelKey }) : t("node.modelUnselected")}</p>}
    </div>}
  </div> : undefined;
  return <SpaceNodeFrame nodeId={nodeId} settingsExpanded={inline && expanded} settingsPanel={settings} contentClassName={styles.content}>
    <div className={styles.body} data-space-generation={modality}>
      {/* Automatic result Inputs own generated media. Keep previews and history carousels out of this body. */}
      <SpaceGenerationPrompt nodeId={nodeId} config={config} modality={modality}
        connected={connection.connected} connectedValue={connection.text} progress={modality === "image" ? runtime?.repeatProgress : undefined} />
      {history.isError && <div role="alert" className={`${styles.feedback} nodrag nopan`}><span>{t("execution.loadError")}</span>
        <AppButton type="button" variant="ghost" size="sm" onClick={() => { void history.refetch(); }}>{t("actions.retry")}</AppButton></div>}
      {execution?.status === "failed" && <div className={styles.feedback} role="alert">
        <span>{t("execution.status.failed")}</span>
      </div>}
    </div>
  </SpaceNodeFrame>;
}
