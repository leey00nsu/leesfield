import { spaceNodeSize } from "./space-editor-groups";
import type { SpaceEditorState } from "./space-editor-store";

export function spaceEditorFormTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input,textarea,select,button,video,audio,[contenteditable]:not([contenteditable='false']),[role='textbox'],[role='slider'],[role='spinbutton'],[role='switch'],[role='combobox'],[role='listbox'],[role='dialog'],[role='alertdialog']"));
}

type ScreenBounds = Pick<DOMRect, "left" | "top" | "right" | "bottom">;

/** Keep the selected node's corner actions reachable when its inspector opens. */
export function spaceInspectorPanOffset(node: ScreenBounds, inspector: ScreenBounds, canvas: ScreenBounds) {
  if (node.right <= inspector.left - 16 || node.left >= inspector.right + 16
    || node.bottom <= inspector.top - 16 || node.top >= inspector.bottom + 16) return null;
  if (canvas.right - canvas.left < 640) {
    return { x: 0, y: Math.max(canvas.top + 48 - node.top, inspector.top - 16 - node.bottom) };
  }
  return { x: inspector.left - 16 - node.right, y: 0 };
}

export function alignedSpaceNodePositions(state: SpaceEditorState, nodeIds: readonly string[], direction: "v" | "h" | "g") {
  const ids = new Set(nodeIds), selected = state.document.nodes.filter(node => ids.has(node.id));
  const sorted = [...selected].sort((a, b) => direction === "v" ? a.position.y - b.position.y : direction === "h" ? a.position.x - b.position.x
    : Math.floor(a.position.y / 100) - Math.floor(b.position.y / 100) || a.position.x - b.position.x);
  if (!sorted.length) return {};
  const startX = Math.min(...selected.map(node => node.position.x)), startY = Math.min(...selected.map(node => node.position.y));
  const sizes = new Map(selected.map(node => [node.id, spaceNodeSize(node, state.geometryByNode)]));
  const maxWidth = Math.max(...[...sizes.values()].map(size => size.width)), maxHeight = Math.max(...[...sizes.values()].map(size => size.height));
  const columns = Math.ceil(Math.sqrt(selected.length));
  let x = startX, y = startY;
  return Object.fromEntries(sorted.map((node, index) => {
    const position = direction === "g" ? { x: startX + index % columns * (maxWidth + 20), y: startY + Math.floor(index / columns) * (maxHeight + 20) } : { x, y };
    if (direction === "h") x += sizes.get(node.id)!.width + 20;
    if (direction === "v") y += sizes.get(node.id)!.height + 20;
    return [node.id, position];
  }));
}

export const spaceNodeShortcuts = { p: "input.prompt", i: "input.image", g: "generate.image", v: "generate.video", t: "generate.audio", y: "input.video" } as const;
