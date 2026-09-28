/**
 * Tone curves: ComfyUI's `CURVE` widget value, and the maths to draw it.
 *
 * The editor has to plot the same shape the engine will apply, or the preview
 * lies about the result. ComfyUI's default interpolation is `monotone_cubic` —
 * a Fritsch–Carlson monotone cubic Hermite spline — which is reimplemented here
 * rather than approximated with a smooth Bézier, because the two visibly differ
 * wherever a curve is asked to stay monotonic through a steep control point.
 */

import type { ComfyCurve } from "./types";

/** The curve a `CurveEditor` starts from: identity, corner to corner. */
export const IDENTITY_CURVE: ComfyCurve = {
  points: [
    [0, 0],
    [1, 1],
  ],
  interpolation: "monotone_cubic",
};

/** Points too close together read as one and make dragging impossible. */
export const MIN_POINT_GAP = 0.02;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * A well-formed curve from whatever was stored.
 *
 * Coordinates are clamped and re-sorted, duplicates on x are dropped, and a
 * degenerate curve falls back to the identity — a saved workflow can carry
 * anything, and the editor must not have to defend against it at every turn.
 */
export function normalizeCurve(value: unknown): ComfyCurve {
  if (!value || typeof value !== "object" || Array.isArray(value)) return IDENTITY_CURVE;
  const raw = (value as { points?: unknown }).points;
  if (!Array.isArray(raw)) return IDENTITY_CURVE;

  const points: Array<[number, number]> = [];
  for (const point of raw) {
    if (!Array.isArray(point) || typeof point[0] !== "number" || typeof point[1] !== "number") {
      continue;
    }
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
    points.push([clamp01(point[0]), clamp01(point[1])]);
  }
  points.sort((a, b) => a[0] - b[0]);

  const deduped: Array<[number, number]> = [];
  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (previous && point[0] - previous[0] < 1e-6) continue;
    deduped.push(point);
  }
  if (deduped.length < 2) return IDENTITY_CURVE;

  const interpolation = (value as { interpolation?: unknown }).interpolation;
  return {
    points: deduped,
    interpolation: typeof interpolation === "string" ? interpolation : "monotone_cubic",
  };
}

/**
 * Tangents for a monotone cubic Hermite spline (Fritsch–Carlson).
 *
 * The limiting step is what makes it monotone: without it a cubic through
 * closely-spaced points overshoots, which on a tone curve shows up as banding
 * the user never asked for.
 */
function monotoneTangents(points: Array<[number, number]>): number[] {
  const n = points.length;
  const secants: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dx = points[i + 1]![0] - points[i]![0];
    secants.push(dx === 0 ? 0 : (points[i + 1]![1] - points[i]![1]) / dx);
  }

  const tangents: number[] = new Array(n);
  tangents[0] = secants[0] ?? 0;
  tangents[n - 1] = secants[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i += 1) {
    const a = secants[i - 1]!;
    const b = secants[i]!;
    tangents[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }

  for (let i = 0; i < n - 1; i += 1) {
    const secant = secants[i]!;
    if (secant === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const alpha = tangents[i]! / secant;
    const beta = tangents[i + 1]! / secant;
    const magnitude = alpha * alpha + beta * beta;
    if (magnitude > 9) {
      const tau = 3 / Math.sqrt(magnitude);
      tangents[i] = tau * alpha * secant;
      tangents[i + 1] = tau * beta * secant;
    }
  }
  return tangents;
}

/**
 * Sample the curve at `x` (0–1).
 *
 * Outside the first and last point the curve holds flat, matching how the
 * endpoints anchor the range.
 */
export function sampleCurve(curve: ComfyCurve, x: number): number {
  const points = curve.points;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];

  if (curve.interpolation === "linear" || points.length === 2) {
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i]!;
      const b = points[i + 1]!;
      if (x <= b[0]) {
        const span = b[0] - a[0];
        const t = span === 0 ? 0 : (x - a[0]) / span;
        return a[1] + t * (b[1] - a[1]);
      }
    }
    return last[1];
  }

  const tangents = monotoneTangents(points);
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (x > b[0]) continue;
    const h = b[0] - a[0];
    if (h === 0) return b[1];
    const t = (x - a[0]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    // Hermite basis.
    return (
      (2 * t3 - 3 * t2 + 1) * a[1] +
      (t3 - 2 * t2 + t) * h * tangents[i]! +
      (-2 * t3 + 3 * t2) * b[1] +
      (t3 - t2) * h * tangents[i + 1]!
    );
  }
  return last[1];
}

/**
 * An SVG path tracing the curve across a `width` × `height` box.
 *
 * Sampled rather than expressed as Béziers: converting monotone Hermite
 * segments to cubic Béziers is easy to get subtly wrong, and at editor size a
 * polyline is indistinguishable from the real thing.
 */
export function curvePath(curve: ComfyCurve, width: number, height: number, samples = 72): string {
  const parts: string[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const x = i / samples;
    const y = clamp01(sampleCurve(curve, x));
    // SVG y grows downward; a tone curve reads with 1 at the top.
    parts.push(`${i === 0 ? "M" : "L"}${(x * width).toFixed(2)} ${((1 - y) * height).toFixed(2)}`);
  }
  return parts.join(" ");
}

/** Insert a point, keeping the list ordered and never crowding a neighbour. */
export function addCurvePoint(curve: ComfyCurve, x: number, y: number): ComfyCurve {
  const at = clamp01(x);
  if (curve.points.some((point) => Math.abs(point[0] - at) < MIN_POINT_GAP)) return curve;
  return normalizeCurve({
    ...curve,
    points: [...curve.points, [at, clamp01(y)] as [number, number]],
  });
}

/**
 * Move one point.
 *
 * The first and last are x-locked: they anchor the ends of the input range, and
 * letting them slide inward would leave the curve undefined at 0 or 1. Interior
 * points cannot cross their neighbours, so the curve stays a function of x.
 */
export function moveCurvePoint(curve: ComfyCurve, index: number, x: number, y: number): ComfyCurve {
  const points = curve.points.map((point) => [...point] as [number, number]);
  const point = points[index];
  if (!point) return curve;
  const isEnd = index === 0 || index === points.length - 1;
  point[1] = clamp01(y);
  if (!isEnd) {
    const lower = points[index - 1]![0] + MIN_POINT_GAP;
    const upper = points[index + 1]![0] - MIN_POINT_GAP;
    // An imported curve is only de-duplicated at 1e-6, so its neighbours can sit
    // closer together than two gaps. The range is then empty, and clamping into
    // an empty range lands *below* the previous point — an unsorted list, which
    // `sampleCurve` and `curvePath` both read as ascending. Such a point is
    // x-locked instead; it can still move vertically.
    if (lower <= upper) point[0] = Math.min(Math.max(clamp01(x), lower), upper);
  }
  return { ...curve, points };
}

/** Remove a point. The two endpoints are permanent — a curve needs both ends. */
export function removeCurvePoint(curve: ComfyCurve, index: number): ComfyCurve {
  if (index <= 0 || index >= curve.points.length - 1) return curve;
  return { ...curve, points: curve.points.filter((_, i) => i !== index) };
}

/** Whether a curve is the identity, i.e. leaves the image untouched. */
export function isIdentityCurve(curve: ComfyCurve): boolean {
  return (
    curve.points.length === 2 &&
    curve.points[0]![0] === 0 &&
    curve.points[0]![1] === 0 &&
    curve.points[1]![0] === 1 &&
    curve.points[1]![1] === 1
  );
}
