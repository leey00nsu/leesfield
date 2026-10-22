import type { SpaceEditorSession } from "./space-editor-store";
import type { SpaceInputResolver } from "./space-editor-inputs";
import { selectedSpaceGenerationModel, type SpaceModelCatalog } from "./space-editor-ports";
import { spaceAttachmentAssetIds, spaceGenerationAttachmentSlots } from "./space-editor-attachments";
import { spaceEditorValueEqual } from "./space-editor-history";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
/** Media intent has its own semantic revision: independent prompt/options can remain editable. */
export function createSpaceAttachmentGuard(options: {
  session: SpaceEditorSession; inputs: SpaceInputResolver; nodeId: string;
  getCatalog: () => SpaceModelCatalog; getEpoch: () => number; subscribe: (listener: () => void) => () => void;
}) {
  const owner = Object.freeze({});
  let stop: (() => void) | null = null;
  const read = (fieldName?: string) => {
    const state = options.session.getSnapshot(), node = state.nodeById.get(options.nodeId);
    const model = node ? selectedSpaceGenerationModel(node, options.getCatalog()) : undefined;
    const all = model ? spaceGenerationAttachmentSlots(model) : [], field = all.find(slot => slot.field.name === fieldName)?.field;
    const slots = fieldName ? all.filter(slot => slot.field.name === fieldName || slot.field.attachment?.pairedWith === fieldName || field?.attachment?.pairedWith === slot.field.name) : all;
    const config = record(node?.config), dynamic = record(record(config.parameters).dynamicParams);
    const ports = slots.flatMap(slot => slot.ports);
    return { model, value: { id: state.id, epoch: options.getEpoch(), exists: Boolean(node), kind: node?.kind, modelKey: config.modelKey,
      assets: slots.map(slot => [slot.field.name, spaceAttachmentAssetIds(options.inputs, options.nodeId, slot), dynamic[slot.field.name]]),
      edges: state.document.edges.filter(edge => edge.targetNodeId === options.nodeId && ports.includes(edge.targetPortId)),
    } };
  };
  const states = new Map<string | undefined, { signature: ReturnType<typeof read>; revision: number }>();
  const refresh = (fieldName?: string) => {
    const next = read(fieldName), previous = states.get(fieldName);
    const revision = (previous?.revision ?? 0) + (previous && (previous.signature.model !== next.model || !spaceEditorValueEqual(previous.signature.value, next.value)) ? 1 : 0);
    const state = { signature: next, revision }; states.set(fieldName, state); return state;
  };
  return {
    owner,
    start() {
      if (!stop) stop = options.subscribe(() => { for (const key of states.keys()) refresh(key); });
      return () => { stop?.(); stop = null; for (const state of states.values()) state.revision++; };
    },
    capture(fieldName?: string) {
      const captured = refresh(fieldName).revision;
      return { attachmentScope: owner, attachmentRevision: captured, attachmentField: fieldName, valid: () => {
        const revision = refresh(fieldName).revision, state = options.session.getSnapshot();
        return !state.disposed && state.writable && state.nodeById.has(options.nodeId) && revision === captured;
      } };
    },
    matches(expected: { attachmentScope?: object; attachmentRevision?: number; attachmentField?: string }) {
      const revision = refresh(expected.attachmentField).revision, state = options.session.getSnapshot();
      return state.writable && !state.disposed && expected.attachmentScope === owner && expected.attachmentRevision === revision;
    },
  };
}
