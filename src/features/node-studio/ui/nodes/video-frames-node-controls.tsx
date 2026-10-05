"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { mediaAssetKeys, useMediaAsset, useMediaAssetList } from "@/features/media-assets/hook/use-media-assets";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import { AppChoiceSelect } from "@/shared/ui/app-choice-select";
import { AppButton } from "@/shared/ui/app-button";
import { mediaAssetIdsForPort } from "@/shared/generation-graph/media-output";
import { useCancelNodeExecution, useNodeExecutions, useStartNodeExecution } from "../../hook/use-node-executions";
import { useNodeAuthoring } from "../../model/node-authoring-context";
import { getPrimaryNodeRunReadinessReason } from "../../model/node-run-readiness";
import type { NodeBananaNodeData } from "../../runtime/node-banana/node-banana-runtime-adapter";
import { NodeBananaExecutionHeader } from "./node-banana-execution-header";
import { NodeBananaOperationPreview } from "./node-banana-operation-preview";
import { NodeViewTabs } from "./node-view-tabs";

const kind = "edit.video.extractFrames";
const ports = ["startFrame", "endFrame"] as const;

export function VideoFramesNodeControls({ id, data, selected, title }: {
  id: string; data: NodeBananaNodeData; selected: boolean; title: string;
}) {
  const tc = useCanvasTranslation();
  const t = useTranslations("nodeStudio");
  const authoring = useNodeAuthoring();
  const queryClient = useQueryClient();
  const [prepared, setPrepared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"source" | "result">("source");
  const pending = useRef<string | null>(null);
  const executions = useNodeExecutions(authoring.graphId, id, prepared || (authoring.isNodePersisted?.(id) ?? true));
  const start = useStartNodeExecution();
  const cancel = useCancelNodeExecution();
  const source = useMediaAsset(authoring.getNodeInputAssetId?.(id, "video") ?? null);
  const bindings = authoring.mediaOutputs?.[id] ?? [];
  const ids = ports.map(port => mediaAssetIdsForPort(kind, port, data.selectedOutputAssetId, bindings)[0] ?? null);
  const images = useMediaAssetList(ids.filter((assetId): assetId is string => Boolean(assetId)));
  const active = executions.data?.find(execution => ["pending", "processing", "uploading"].includes(execution.status));
  const history = executions.data?.filter(execution => execution.status === "completed" && execution.outputBindings?.some(binding => binding.assetId)) ?? [];
  const selectedExecution = history.find(execution => execution.outputBindings?.some(binding => binding.assetId === data.selectedOutputAssetId));
  const readiness = authoring.getNodeRunReadiness?.(id) ?? { ready: true, reasons: [] };
  const blocked = getPrimaryNodeRunReadinessReason(readiness);
  const writable = authoring.writable !== false && Boolean(authoring.updateCanonicalNodeConfig);
  const executing = Boolean(active) || submitting || start.isPending;

  useEffect(() => {
    if (!pending.current) return;
    const execution = executions.data?.find(item => item.executionId === pending.current);
    if (execution?.status === "completed" && execution.outputAssetIds[0]) {
      pending.current = null;
      authoring.selectNodeOutputAsset?.(id, execution.outputAssetIds[0]);
      setView("result");
      void queryClient.invalidateQueries({ queryKey: mediaAssetKeys.all });
    } else if (execution?.status === "failed" || execution?.status === "cancelled") pending.current = null;
  }, [authoring, executions.data, id, queryClient]);

  const run = async () => {
    if (!writable || !readiness.ready || executing) return;
    setSubmitting(true); setError(null);
    try {
      if (authoring.runNode) { await authoring.runNode(id); return; }
      const expectedGraphVersion = await (authoring.prepareNodeExecution ?? authoring.prepareImageNodeExecution)();
      setPrepared(true);
      const execution = await start.mutateAsync({ graphId: authoring.graphId, nodeId: id, expectedGraphVersion });
      pending.current = execution.executionId;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "PROCESSOR_FAILED"); }
    finally { setSubmitting(false); }
  };
  const failed = executions.data?.[0]?.status === "failed" ? executions.data[0].errorCode : null;

  return <>
    <NodeBananaExecutionHeader id={id} title={title} config={data.config} selected={selected}
      ready={writable && readiness.ready} executing={executing}
      disabledReason={blocked ? t(`execution.blocked.${blocked}`) : null} onRun={() => void run()}
      onCancel={active ? () => void (authoring.cancelNode ? authoring.cancelNode(id) : cancel.mutateAsync({ graphId: authoring.graphId, nodeId: id, executionId: active.executionId })).catch(() => undefined) : undefined}
      cancelling={cancel.isPending} />
    <div className="mt-2 flex min-h-0 flex-1 flex-col gap-3" data-node-banana-kind={kind}>
      {!authoring.runNode && <div className="flex shrink-0"><NodeViewTabs id={id} label={title} value={view} onChange={setView}
        tabs={[{ value: "source", label: tc("Source") }, { value: "result", label: tc("Result") }]} /></div>}
      <div role="tabpanel" id={`${id}-${view}-panel`} aria-labelledby={`${id}-${view}-tab`}
        className="nodrag nopan nowheel grid min-h-0 flex-1 content-start gap-2 overflow-y-auto" onPointerDown={event => event.stopPropagation()}>
        {authoring.runNode || view === "source" ? <NodeBananaOperationPreview asset={source.data} expectedType="video" emptyLabel={tc("Connect a video")} /> : <>
          <div className="grid grid-cols-2 gap-2">{ports.map((port, index) => <section key={port} aria-label={tc(index === 0 ? "Start frame" : "End frame")} className="grid gap-1">
            <h3 className="text-xs text-neutral-400">{tc(index === 0 ? "Start frame" : "End frame")}</h3>
            <NodeBananaOperationPreview asset={images.find(image => image.data?.id === ids[index])?.data} expectedType="image" output emptyLabel={tc("No result yet")} />
          </section>)}</div>
          {history.length ? <AppChoiceSelect label={t("mediaNodes.openHistory")} value={selectedExecution?.executionId ?? ""}
            disabled={!writable || executing} options={history.map((execution, index) => ({ value: execution.executionId,
              label: `${t("mediaNodes.openHistory")} ${history.length - index} · ${new Date(execution.createdAt).toLocaleString()}` }))}
            onValueChange={value => { const execution = history.find(item => item.executionId === value);
              const assetId = execution?.outputBindings?.find(binding => binding.assetId)?.assetId;
              if (assetId) authoring.selectNodeOutputAsset?.(id, assetId);
            }} /> : null}
          {ids.some(Boolean) && writable ? <AppButton variant="ghost" size="sm" disabled={executing}
            onClick={() => authoring.selectNodeOutputAsset?.(id, null)}>{tc("Clear result")}</AppButton> : null}
        </>}
      </div>
      {executing ? <p role="status" className="text-xs text-neutral-400">{t(`execution.status.${active?.status ?? "pending"}`)}</p> : null}
      {error || failed ? <p role="alert" className="text-xs text-red-300">{tc("Operation failed")}: {error ?? failed}</p> : null}
    </div>
  </>;
}
