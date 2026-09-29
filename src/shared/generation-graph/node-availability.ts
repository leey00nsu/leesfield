import type { CanonicalNodeKind } from "./node-registry";

/** Retained for reading old Spaces, but unavailable for new authoring or runs. */
export const unavailableEditNodeKinds = [
  "edit.image.annotation",
  "edit.image.removeBackground",
  "edit.image.splitGrid",
  "edit.image.gif",
  "edit.video.frameGrab",
  "edit.video.easeCurve",
] as const satisfies readonly CanonicalNodeKind[];

const unavailableKinds = new Set<string>(unavailableEditNodeKinds);

export function isUnavailableEditNodeKind(kind: string): boolean {
  return unavailableKinds.has(kind);
}
