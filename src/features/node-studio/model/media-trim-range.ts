export type TrimRange = { startMs: number; endMs: number };
export type TrimGesture = "start" | "end" | "move";
export const minimumTrimMs = 40;
export const clampMediaTime = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(n)));
export function adjustTrimRange(range: TrimRange, handle: TrimGesture, delta: number, duration: number, snap = false): TrimRange {
  const quantize = (n: number) => snap ? Math.round(n / 1000) * 1000 : Math.round(n);
  if (handle === "move") {
    const length = range.endMs - range.startMs;
    const startMs = clampMediaTime(quantize(range.startMs + delta), 0, duration - length);
    return { startMs, endMs: startMs + length };
  }
  const gap = Math.min(minimumTrimMs, duration);
  return handle === "start" ? { ...range, startMs: clampMediaTime(quantize(range.startMs + delta), 0, range.endMs - gap) }
    : { ...range, endMs: clampMediaTime(quantize(range.endMs + delta), range.startMs + gap, duration) };
}
export function trimKeyboardRange(range: TrimRange, key: string, duration: number, position: number, shift = false, command = false, snap = false) {
  const step = command ? 1000 : shift ? 10 : 100;
  const adjustment = snap && !shift ? 1000 : step, gap = Math.min(minimumTrimMs, duration);
  if (key === "ArrowLeft" || key === "ArrowRight") return command ? null : adjustTrimRange(range, "move", key === "ArrowLeft" ? -adjustment : adjustment, duration, snap && !shift);
  if (key === "ArrowUp" || key === "ArrowDown") return adjustTrimRange(range, "end", key === "ArrowUp" ? -adjustment : adjustment, duration, snap && !shift);
  if (!command && key.toLowerCase() === "i") return { ...range, startMs: clampMediaTime(position, 0, range.endMs - gap) };
  if (!command && key.toLowerCase() === "o") return { ...range, endMs: clampMediaTime(position, range.startMs + gap, duration) };
  return null;
}
