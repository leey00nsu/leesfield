"use client";

import { useEffect, useMemo, type ComponentProps, type ReactNode } from "react";
import { NodeAuthoringProvider } from "../../model/node-authoring-context";
import { useSpacePreferences } from "../../hook/use-space-preferences";
import { captureSpaceAttachmentExpectation, replaceRelatedSpaceGenerationAttachments, spaceAttachmentExpectationMatches, spaceGenerationAttachmentSlots } from "../../model/space-editor-attachments";
import { selectedSpaceGenerationModel } from "../../model/space-editor-ports";
import { updateSpaceNodeAuthoringConfig } from "../../model/space-editor-authoring";
import { emptyImageNodeInputReadiness } from "../../model/node-input-readiness";
import { resolveNodeRunReadiness } from "../../model/node-run-readiness";
import { hasSpaceMediaUpload } from "../../model/space-editor-media";
import { useSpaceEditor, useSpaceResolvedInput, useSpaceSelector, useSpaceViewSelector } from "../space-editor-provider";
import { hasPendingReferenceUploads } from "@/shared/ui/reference-upload-scope";
import { createSpaceAttachmentGuard } from "../../model/space-editor-attachment-guard";

/** Existing product forms see only this node's authoring slice and stable actions. */
export function SpaceNodeAuthoringProvider({ nodeId, children }: { nodeId: string; children: ReactNode }) {
  const scope = useSpaceEditor(), preferences = useSpacePreferences();
  const node = useSpaceSelector(state => state.nodeById.get(nodeId)), writable = useSpaceSelector(state => state.writable);
  const persisted = useSpaceSelector(state => state.persistedNodeIds.has(nodeId)), runtime = useSpaceSelector(state => state.runtimeByNode.get(nodeId));
  const catalog = useSpaceViewSelector(state => state.catalog);
  const trackModel = preferences?.trackModel;
  const attachmentGuard = useMemo(() => createSpaceAttachmentGuard({ session: scope.session, inputs: scope.inputs, nodeId,
    getCatalog: () => scope.view.getState().catalog, getEpoch: () => scope.view.getState().epoch, subscribe: listener => scope.view.subscribe(listener) }), [scope, nodeId]);
  useEffect(() => attachmentGuard.start(), [attachmentGuard]);
  const { value } = useSpaceResolvedInput(nodeId, (): {
    value: ComponentProps<typeof NodeAuthoringProvider>["value"]; runtime: typeof runtime; persisted: boolean;
  } => {
    const report = (result: { ok: boolean; message?: string }) => { if (!result.ok) scope.view.getState().services.onError?.(new Error(result.message ?? "SPACE_EDIT_FAILED")); };
    const update = (id: string, config: Parameters<NonNullable<ComponentProps<typeof NodeAuthoringProvider>["value"]["updateCanonicalNodeConfig"]>>[1]) => {
      const base = id === nodeId ? node : undefined;
      if (!base || !scope.session.getSnapshot().writable) return;
      const result = scope.session.transact(document => updateSpaceNodeAuthoringConfig(document, id, base.config, config, scope.view.getState().catalog), { origin: "user", label: "node.authoring" });
      report(result);
      if (result.ok && result.changed && config && typeof config === "object" && !Array.isArray(config)
        && typeof config.modelKey === "string" && base.config && typeof base.config === "object" && !Array.isArray(base.config) && base.config.modelKey !== config.modelKey) trackModel?.(config.modelKey);
    };
    const prepare = () => {
      const action = scope.view.getState().services.prepareNodeExecution;
      return action ? action() : Promise.reject(new Error("SPACE_EXECUTION_WORKSPACE_REQUIRED"));
    };
    const inputRuntime = scope.getInputRuntime();
    return { runtime, persisted, value: { ...catalog, graphId: scope.session.getSnapshot().id, writable,
      assistantResults: inputRuntime.assistantResults, mediaOutputs: inputRuntime.mediaOutputs ? Object.fromEntries(inputRuntime.mediaOutputs) : undefined,
      prepareImageNodeExecution: prepare, prepareNodeExecution: prepare,
      runNode: async id => scope.view.getState().services.runNode?.(id), cancelNode: async id => { await scope.view.getState().services.cancelNode?.(id); },
      isNodeRunning: id => { const execution = scope.session.getSnapshot().runtimeByNode.get(id)?.execution; return Boolean(execution && ["pending", "processing", "uploading"].includes(execution.status)); },
      updateCanonicalNodeConfig: update, updateImageNodeConfig: (id, config) => update(id, config),
      updateMemoNodeSize: (id, size) => { report(scope.session.dispatch({ type: "node.config.patch", nodeId: id, patch: { size } })); },
      duplicateImageNode: id => { report(scope.session.dispatch({ type: "nodes.duplicate", nodeIds: [id] })); },
      deleteImageNode: id => { report(scope.session.dispatch({ type: "node.remove", nodeId: id })); },
      isNodePersisted: id => scope.session.getSnapshot().persistedNodeIds.has(id),
      selectNodeOutputAsset: (id, assetId) => { report(scope.session.dispatch({ type: "output.select", nodeId: id, assetId })); },
      getNodePromptInput: id => scope.inputs.promptInput(id),
      getNodeInputAssetId: (id, port) => scope.inputs.inputAssetIds(id, port)[0] ?? null,
      getNodeInputAssetIds: (id, port) => [...scope.inputs.inputAssetIds(id, port)],
      getNodeInputAssetSlots: (id, port) => [...scope.inputs.inputAssetSlots(id, port)],
      isNodePortConnected: (id, port) => scope.inputs.isConnected(id, port),
      captureNodeInputGuard: (id, slot) => id === nodeId ? attachmentGuard.capture(slot?.field.name).valid : () => false,
      captureNodeInputAssets: (id, slot, slots) => {
        const related = slots.filter(item => item.field.name === slot.field.name || item.field.attachment?.pairedWith === slot.field.name || slot.field.attachment?.pairedWith === item.field.name);
        const expected = captureSpaceAttachmentExpectation(scope.inputs, id, slot, related), captured = attachmentGuard.capture(slot.field.name);
        return { ...expected, inputRevision: undefined, attachmentScope: captured.attachmentScope, attachmentRevision: captured.attachmentRevision, attachmentField: captured.attachmentField };
      },
      replaceNodeInputAssets: (id, slot, assetIds, expected, order) => {
        const current = scope.session.getSnapshot(), target = current.nodeById.get(id);
        if (!current.writable || !target || id !== nodeId || (expected.attachmentScope && (expected.attachmentField !== slot.field.name || !attachmentGuard.matches(expected)))) return false;
        const model = selectedSpaceGenerationModel(target, scope.view.getState().catalog), slots = model ? spaceGenerationAttachmentSlots(model) : [];
        if (!spaceAttachmentExpectationMatches(current.document, id, slot, expected, slots, scope.getInputRuntime(), scope.inputs)) return false;
        const result = scope.session.transact(document => replaceRelatedSpaceGenerationAttachments(document, id, slots, slot, assetIds,
          () => crypto.randomUUID(), order, scope.getInputRuntime()), { origin: "user", label: "node.attachments" });
        report(result); return result.ok;
      },
      getImageNodeInputReadiness: id => {
        const result = emptyImageNodeInputReadiness(), assets = new Set<string>();
        for (const edge of scope.inputs.incomingEdges(id)) {
          if (edge.hasPause || !["primary", "reference", "references"].includes(edge.targetPortId)) continue;
          const group = edge.targetPortId === "primary" ? result.primary : result.reference, ids = scope.inputs.edgeAssetIds(edge);
          group.connectedCount++; result.connectedCount++;
          if (ids.length) { group.readyCount++; result.readyCount++; ids.forEach(asset => assets.add(asset)); }
          else { group.missingCount++; result.missingCount++; }
        }
        result.resolvedCount = assets.size; return result;
      },
      getNodeRunReadiness: id => {
        const inputs = scope.getInputRuntime();
        const result = resolveNodeRunReadiness(scope.session.getDocument(), id, { ...scope.view.getState().catalog, assistantResults: inputs.assistantResults,
          mediaOutputs: inputs.mediaOutputs ? Object.fromEntries(inputs.mediaOutputs) : undefined });
        return hasSpaceMediaUpload(scope.session.getSnapshot()) || hasPendingReferenceUploads("space:") ? { ...result, ready: false } : result;
      },
    } };
  });
  return <NodeAuthoringProvider value={value}>{children}</NodeAuthoringProvider>;
}
