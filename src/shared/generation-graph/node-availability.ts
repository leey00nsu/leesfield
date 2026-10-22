import type { CanonicalNodeKind } from "./node-registry";

/** Kept in canonical data and execution code while absent from product surfaces. */
export const temporarilyHiddenEditNodeKinds = [
  "edit.video.trim",
  "edit.video.stitch",
  "edit.image.resize",
] as const satisfies readonly CanonicalNodeKind[];

/** Retained for reading old Spaces, but unavailable for new authoring or runs. */
export const unavailableEditNodeKinds = [
  "edit.image.annotation",
  "edit.image.removeBackground",
  "edit.image.splitGrid",
  "edit.image.gif",
  "edit.video.frameGrab",
  "edit.video.easeCurve",
  ...temporarilyHiddenEditNodeKinds,
] as const satisfies readonly CanonicalNodeKind[];

const unavailableKinds = new Set<string>(unavailableEditNodeKinds);
const temporarilyHiddenKinds = new Set<string>(temporarilyHiddenEditNodeKinds);

export function isTemporarilyHiddenEditNodeKind(kind: string): boolean {
  return temporarilyHiddenKinds.has(kind);
}

export function isUnavailableEditNodeKind(kind: string): boolean {
  return unavailableKinds.has(kind);
}
