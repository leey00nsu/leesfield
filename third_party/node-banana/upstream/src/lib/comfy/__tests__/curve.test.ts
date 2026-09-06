import { describe, it, expect } from "vitest";

import {
  IDENTITY_CURVE,
  addCurvePoint,
  curvePath,
  isIdentityCurve,
  moveCurvePoint,
  normalizeCurve,
  removeCurvePoint,
  sampleCurve,
} from "../curve";
import type { ComfyCurve } from "../types";

const curve = (points: Array<[number, number]>, interpolation = "monotone_cubic"): ComfyCurve => ({
  points,
  interpolation,
});

describe("normalizeCurve", () => {
  it("keeps a well-formed curve, interpolation and all", () => {
    const input = curve([
      [0, 0],
      [0.5, 0.8],
      [1, 1],
    ]);
    expect(normalizeCurve(input)).toEqual(input);
  });

  it("falls back to the identity for anything unusable", () => {
    // A saved workflow can carry anything; the editor must not have to defend
    // against it on every interaction.
    for (const bad of [null, undefined, 42, "curve", {}, { points: [] }, { points: [[0, 0]] }]) {
      expect(normalizeCurve(bad)).toEqual(IDENTITY_CURVE);
    }
  });

  it("clamps out-of-range coordinates into 0–1", () => {
    const result = normalizeCurve(curve([
      [-1, 2],
      [3, -4],
    ]));
    expect(result.points).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it("sorts by x and drops points sharing one", () => {
    const result = normalizeCurve(curve([
      [1, 1],
      [0.4, 0.2],
      [0, 0],
      [0.4, 0.9],
    ]));
    expect(result.points).toEqual([
      [0, 0],
      [0.4, 0.2],
      [1, 1],
    ]);
  });

  it("discards non-finite coordinates rather than propagating NaN", () => {
    const result = normalizeCurve({
      points: [
        [0, 0],
        [Number.NaN, 0.5],
        [1, 1],
      ],
    });
    expect(result.points).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });
});

describe("sampleCurve", () => {
  it("is the identity for the default curve", () => {
    for (const x of [0, 0.25, 0.5, 0.75, 1]) {
      expect(sampleCurve(IDENTITY_CURVE, x)).toBeCloseTo(x, 6);
    }
  });

  it("passes exactly through its control points", () => {
    const c = curve([
      [0, 0.1],
      [0.5, 0.7],
      [1, 0.9],
    ]);
    expect(sampleCurve(c, 0)).toBeCloseTo(0.1, 6);
    expect(sampleCurve(c, 0.5)).toBeCloseTo(0.7, 6);
    expect(sampleCurve(c, 1)).toBeCloseTo(0.9, 6);
  });

  it("holds flat outside the first and last point", () => {
    const c = curve([
      [0.25, 0.4],
      [0.75, 0.6],
    ]);
    expect(sampleCurve(c, 0)).toBeCloseTo(0.4, 6);
    expect(sampleCurve(c, 1)).toBeCloseTo(0.6, 6);
  });

  it("never overshoots between points", () => {
    // The whole reason for Fritsch–Carlson limiting: a plain cubic through these
    // points rises above 1 after x=0.5, which on a tone curve is visible banding.
    const c = curve([
      [0, 0],
      [0.5, 0.9],
      [1, 1],
    ]);
    let previous = -Infinity;
    for (let i = 0; i <= 200; i += 1) {
      const y = sampleCurve(c, i / 200);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeLessThanOrEqual(1 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = y;
    }
  });

  it("interpolates linearly when the curve asks for it", () => {
    const c = curve(
      [
        [0, 0],
        [0.5, 0.9],
        [1, 1],
      ],
      "linear"
    );
    expect(sampleCurve(c, 0.25)).toBeCloseTo(0.45, 6);
  });
});

describe("curvePath", () => {
  it("spans the box with y flipped for screen space", () => {
    const path = curvePath(IDENTITY_CURVE, 100, 50, 4);
    // Identity starts bottom-left and ends top-right once y is inverted.
    expect(path.startsWith("M0.00 50.00")).toBe(true);
    expect(path.endsWith("L100.00 0.00")).toBe(true);
  });
});

describe("editing", () => {
  it("adds a point in order", () => {
    const result = addCurvePoint(IDENTITY_CURVE, 0.5, 0.8);
    expect(result.points).toEqual([
      [0, 0],
      [0.5, 0.8],
      [1, 1],
    ]);
  });

  it("refuses a point that would land on top of another", () => {
    const result = addCurvePoint(IDENTITY_CURVE, 0.005, 0.5);
    // Two points a hair apart are indistinguishable and impossible to drag.
    expect(result).toBe(IDENTITY_CURVE);
  });

  it("locks the endpoints to x=0 and x=1 but lets them move vertically", () => {
    const moved = moveCurvePoint(IDENTITY_CURVE, 0, 0.7, 0.3);
    expect(moved.points[0]).toEqual([0, 0.3]);
    const movedEnd = moveCurvePoint(IDENTITY_CURVE, 1, 0.2, 0.4);
    expect(movedEnd.points[1]).toEqual([1, 0.4]);
  });

  it("stops an interior point crossing its neighbours", () => {
    const three = curve([
      [0, 0],
      [0.5, 0.5],
      [1, 1],
    ]);
    // Dragged well past the right-hand point: the curve must stay a function
    // of x, so it is held short of it.
    const moved = moveCurvePoint(three, 1, 5, 0.5);
    expect(moved.points[1]![0]).toBeLessThan(1);
    expect(moved.points[1]![0]).toBeGreaterThan(0);
    expect(moved.points.map((p) => p[0])).toEqual([...moved.points.map((p) => p[0])].sort((a, b) => a - b));
  });

  it("keeps the order when an imported curve crowds a point", () => {
    // `normalizeCurve` only drops duplicates within 1e-6, so a workflow can
    // carry neighbours closer together than two MIN_POINT_GAPs. The clamp
    // range is then empty, and clamping into an empty range lands *below* the
    // previous point — an unsorted list that `sampleCurve` reads as ascending,
    // so the drawn curve stops matching the stored value.
    const crowded = {
      points: [
        [0, 0],
        [0.5, 0.5],
        [0.51, 0.6],
        [0.52, 0.7],
        [1, 1],
      ] as Array<[number, number]>,
    };

    const moved = moveCurvePoint(crowded, 2, 0, 0.9);
    const xs = moved.points.map((p) => p[0]);

    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    // Held where it was on x, but still free to move vertically.
    expect(moved.points[2]![0]).toBe(0.51);
    expect(moved.points[2]![1]).toBe(0.9);
  });

  it("removes an interior point and keeps the endpoints", () => {
    const three = addCurvePoint(IDENTITY_CURVE, 0.5, 0.8);
    expect(removeCurvePoint(three, 1).points).toEqual(IDENTITY_CURVE.points);
    // A curve needs both ends to be defined over the range.
    expect(removeCurvePoint(three, 0)).toBe(three);
    expect(removeCurvePoint(three, 2)).toBe(three);
  });

  it("recognises the untouched curve", () => {
    expect(isIdentityCurve(IDENTITY_CURVE)).toBe(true);
    expect(isIdentityCurve(addCurvePoint(IDENTITY_CURVE, 0.5, 0.8))).toBe(false);
    expect(isIdentityCurve(moveCurvePoint(IDENTITY_CURVE, 0, 0, 0.2))).toBe(false);
  });
});
