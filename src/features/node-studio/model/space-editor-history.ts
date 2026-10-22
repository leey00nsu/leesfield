import type { SpaceEditorDocument } from "./space-editor-types";

type Collection = "nodes" | "edges" | "groups";
type Slot = { exists: false } | { exists: true; value: unknown };
type FieldPatch = { type: "field"; collection: Collection | "document"; id?: string; path: readonly string[]; before: Slot; after: Slot; container?: boolean };
type EntityPatch = { type: "entity"; collection: Collection; id: string; before: Slot; after: Slot; index: number; previousId?: string; nextId?: string };
type OrderPatch = { type: "order"; collection: Collection; before: readonly string[]; after: readonly string[] };
type HistoryPatch = FieldPatch | EntityPatch | OrderPatch;

export interface SpaceEditorHistoryEntry {
  readonly patches: readonly HistoryPatch[];
  readonly selectionNodeIds: readonly string[];
  readonly label: string;
}

export const spaceEditorHistoryLimit = 50;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** JSON equality without serialization. Interaction-only updates never call this. */
export function spaceEditorValueEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => spaceEditorValueEqual(value, b[index]));
  if (!record(a) || !record(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && spaceEditorValueEqual(a[key], b[key]));
}

function share<T>(before: T, after: T): T {
  if (Object.is(before, after)) return before;
  if (Array.isArray(before) && Array.isArray(after)) {
    const next = after.map((item, index) => share(before[index], item));
    return (before.length === next.length && next.every((item, index) => item === before[index]) ? before : next) as T;
  }
  if (record(before) && record(after)) {
    const next = Object.fromEntries(Object.entries(after).map(([key, value]) => [key, Object.hasOwn(before, key) ? share(before[key], value) : value]));
    return (Object.keys(before).length === Object.keys(next).length && Object.keys(next).every((key) => Object.hasOwn(before, key) && next[key] === before[key]) ? before : next) as T;
  }
  return after;
}

/** Reuse unchanged entities even if a system transform reconstructed its arrays. */
export function reconcileSpaceEditorDocument(before: SpaceEditorDocument, after: SpaceEditorDocument): SpaceEditorDocument {
  if (before === after) return before;
  const entities = <T extends { id: string }>(previous: T[], next: T[]): T[] => {
    if (previous === next) return previous;
    const byId = new Map(previous.map((entity) => [entity.id, entity]));
    const result = next.map((entity) => byId.has(entity.id) ? share(byId.get(entity.id)!, entity) : entity);
    return previous.length === result.length && result.every((entity, index) => entity === previous[index]) ? previous : result;
  };
  const nodes = entities(before.nodes, after.nodes), edges = entities(before.edges, after.edges), groups = entities(before.groups, after.groups);
  return nodes === before.nodes && edges === before.edges && groups === before.groups && before.title === after.title && before.schemaVersion === after.schemaVersion
    ? before : { ...after, nodes, edges, groups };
}

function slot(object: Record<string, unknown>, key: string): Slot {
  return Object.hasOwn(object, key) ? { exists: true, value: object[key] } : { exists: false };
}

function fields(before: Record<string, unknown>, after: Record<string, unknown>, base: Omit<FieldPatch, "type" | "path" | "before" | "after">, path: string[], patches: HistoryPatch[]) {
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const old = slot(before, key), next = slot(after, key);
    if (old.exists && next.exists && spaceEditorValueEqual(old.value, next.value)) continue;
    if (!old.exists && next.exists && record(next.value)) {
      patches.push({ ...base, type: "field", path: [...path, key], before: old, after: { exists: true, value: {} }, container: true });
      fields({}, next.value, base, [...path, key], patches);
    } else if (old.exists && record(old.value) && !next.exists) {
      fields(old.value, {}, base, [...path, key], patches);
      patches.push({ ...base, type: "field", path: [...path, key], before: { exists: true, value: {} }, after: next, container: true });
    } else if (old.exists && next.exists && record(old.value) && record(next.value)) fields(old.value, next.value, base, [...path, key], patches);
    else patches.push({ ...base, type: "field", path: [...path, key], before: old, after: next });
  }
}

/** Own only changed fields and added/deleted entities, never a graph snapshot. */
export function createSpaceEditorHistoryEntry(before: SpaceEditorDocument, after: SpaceEditorDocument, selectionNodeIds: readonly string[] = [], label = "edit"): SpaceEditorHistoryEntry {
  const patches: HistoryPatch[] = [];
  if (before.title !== after.title) patches.push({ type: "field", collection: "document", path: ["title"], before: { exists: true, value: before.title }, after: { exists: true, value: after.title } });
  for (const collection of ["nodes", "edges", "groups"] as const) {
    const previous = new Map(before[collection].map((entity) => [entity.id, entity]));
    const next = new Map(after[collection].map((entity) => [entity.id, entity]));
    before[collection].forEach((entity, index) => {
      const replacement = next.get(entity.id);
      if (!replacement) patches.push({ type: "entity", collection, id: entity.id, index, previousId: before[collection][index - 1]?.id, nextId: before[collection][index + 1]?.id, before: { exists: true, value: entity }, after: { exists: false } });
      else if (replacement !== entity) fields(entity, replacement, { collection, id: entity.id }, [], patches);
    });
    after[collection].forEach((entity, index) => {
      if (!previous.has(entity.id)) patches.push({ type: "entity", collection, id: entity.id, index, previousId: after[collection][index - 1]?.id, nextId: after[collection][index + 1]?.id, before: { exists: false }, after: { exists: true, value: entity } });
    });
    const oldOrder = before[collection].filter((entity) => next.has(entity.id)).map((entity) => entity.id);
    const newOrder = after[collection].filter((entity) => previous.has(entity.id)).map((entity) => entity.id);
    if (!spaceEditorValueEqual(oldOrder, newOrder)) patches.push({ type: "order", collection, before: before[collection].map((entity) => entity.id), after: after[collection].map((entity) => entity.id) });
  }
  return { patches, selectionNodeIds: [...selectionNodeIds], label };
}

function writePath(value: unknown, path: readonly string[], replacement: Slot): unknown {
  if (!path.length) return replacement.exists ? replacement.value : undefined;
  const [key, ...rest] = path;
  const original = record(value) ? value : {};
  const child = Object.hasOwn(original, key) ? original[key] : undefined;
  if (rest.length) return { ...original, [key]: writePath(child, rest, replacement) };
  const result = { ...original };
  if (replacement.exists) return { ...result, [key]: replacement.value };
  delete result[key];
  return result;
}

function writeField(value: unknown, patch: FieldPatch, replacement: Slot): unknown {
  if (patch.container) {
    let current = value;
    for (const key of patch.path) current = record(current) && Object.hasOwn(current, key) ? current[key] : undefined;
    // A container marker owns only its existence. Later system children must
    // survive adding/removing an otherwise empty optional config object.
    if (replacement.exists ? record(current) : !record(current) || Object.keys(current).length > 0) return value;
  }
  return writePath(value, patch.path, replacement);
}

export function applySpaceEditorHistoryEntry(document: SpaceEditorDocument, entry: SpaceEditorHistoryEntry, direction: "undo" | "redo"): SpaceEditorDocument {
  let next = document;
  // Restore entities in original ascending order; reverse only field patches
  // so optional-object existence follows its owned child fields.
  const entityPatches = entry.patches.filter((patch) => patch.type === "entity");
  const fieldPatches = entry.patches.filter((patch) => patch.type === "field");
  const patches = [...entityPatches, ...entry.patches.filter((patch) => patch.type === "order"), ...(direction === "undo" ? fieldPatches.reverse() : fieldPatches)];
  for (const patch of patches) {
    if (patch.type === "order") {
      const items: { id: string }[] = next[patch.collection];
      const byId = new Map(items.map((item) => [item.id, item]));
      const ids = direction === "undo" ? patch.before : patch.after;
      const ownedIds = new Set(ids);
      const ordered = ids.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
      let index = 0;
      // System-added entities keep their slots while owned entities reorder.
      next = { ...next, [patch.collection]: items.map((item) => ownedIds.has(item.id) ? ordered[index++] : item) };
      continue;
    }
    const replacement = direction === "undo" ? patch.before : patch.after;
    if (patch.type === "field" && patch.collection === "document") {
      next = writeField(next, patch, replacement) as SpaceEditorDocument;
      continue;
    }
    const collection = patch.collection as Collection;
    const items: { id: string }[] = next[collection];
    let changed: { id: string }[];
    if (patch.type === "entity") {
      const remaining = items.filter((item) => item.id !== patch.id);
      if (replacement.exists) {
        const previousIndex = remaining.findIndex((item) => item.id === patch.previousId);
        const nextIndex = remaining.findIndex((item) => item.id === patch.nextId);
        const index = previousIndex >= 0 ? previousIndex + 1 : nextIndex >= 0 ? nextIndex : Math.min(patch.index, remaining.length);
        remaining.splice(index, 0, replacement.value as { id: string });
      }
      changed = remaining;
    } else {
      // A later system deletion is authoritative: a field inverse cannot resurrect a node.
      changed = items.map((item) => item.id === patch.id ? writeField(item, patch, replacement) as { id: string } : item);
    }
    next = { ...next, [collection]: changed };
  }
  return reconcileSpaceEditorDocument(document, next);
}
