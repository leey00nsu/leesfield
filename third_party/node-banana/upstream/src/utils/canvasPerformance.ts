import type { ReactFlowState } from "@xyflow/react";

export const OVERVIEW_ZOOM_THRESHOLD = 0.15;

export function isOverviewZoom(zoom: number): boolean {
  return zoom < OVERVIEW_ZOOM_THRESHOLD;
}

export function selectCanvasOverview(
  state: Pick<ReactFlowState, "transform">
): boolean {
  return isOverviewZoom(state.transform[2]);
}

export function setCanvasPanningClass(
  isPanning: boolean,
  root: HTMLElement
): void {
  root.classList.toggle("canvas-native-navigation-active", isPanning);
}

export function setCanvasWheelPanningClass(
  isPanning: boolean,
  root: HTMLElement
): void {
  root.classList.toggle("canvas-wheel-navigation-active", isPanning);
}
