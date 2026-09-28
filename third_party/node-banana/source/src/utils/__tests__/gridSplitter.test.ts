import { describe, it, expect } from "vitest";
import { createGridForDimensions } from "../gridSplitter";

/**
 * createGridForDimensions is the pure geometry behind image slicing. These
 * tests cover uniform slicing and the non-uniform slicing produced by the
 * split-grid node's draggable grid lines.
 */
describe("createGridForDimensions", () => {
  it("produces uniform cells that tile the image exactly with no offsets", () => {
    const grid = createGridForDimensions(400, 200, 2, 2);
    expect(grid.cells).toHaveLength(4);
    // Row-major: (0,0) (0,1) (1,0) (1,1)
    expect(grid.cells[0]).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(grid.cells[1]).toEqual({ x: 200, y: 0, width: 200, height: 100 });
    expect(grid.cells[2]).toEqual({ x: 0, y: 100, width: 200, height: 100 });
    expect(grid.cells[3]).toEqual({ x: 200, y: 100, width: 200, height: 100 });
  });

  it("places interior boundaries at the custom column/row offsets", () => {
    // A vertical line at 25% and a horizontal line at 75%.
    const grid = createGridForDimensions(400, 200, 2, 2, {
      colOffsets: [0.25],
      rowOffsets: [0.75],
    });
    // Column boundary at 0.25*400 = 100; row boundary at 0.75*200 = 150.
    expect(grid.cells[0]).toEqual({ x: 0, y: 0, width: 100, height: 150 });
    expect(grid.cells[1]).toEqual({ x: 100, y: 0, width: 300, height: 150 });
    expect(grid.cells[2]).toEqual({ x: 0, y: 150, width: 100, height: 50 });
    expect(grid.cells[3]).toEqual({ x: 100, y: 150, width: 300, height: 50 });
  });

  it("tiles exactly (adjacent cells share edges, cover the full image) for uneven offsets", () => {
    const width = 333;
    const height = 217;
    const grid = createGridForDimensions(width, height, 3, 3, {
      colOffsets: [0.2, 0.55],
      rowOffsets: [0.4, 0.9],
    });
    // Every row of cells spans the full width with no gap or overlap.
    for (let row = 0; row < 3; row++) {
      const rowCells = grid.cells.slice(row * 3, row * 3 + 3);
      expect(rowCells[0].x).toBe(0);
      expect(rowCells[0].x + rowCells[0].width).toBe(rowCells[1].x);
      expect(rowCells[1].x + rowCells[1].width).toBe(rowCells[2].x);
      expect(rowCells[2].x + rowCells[2].width).toBe(width);
    }
    // Every column spans the full height with no gap or overlap.
    for (let col = 0; col < 3; col++) {
      const colCells = [grid.cells[col], grid.cells[col + 3], grid.cells[col + 6]];
      expect(colCells[0].y).toBe(0);
      expect(colCells[0].y + colCells[0].height).toBe(colCells[1].y);
      expect(colCells[1].y + colCells[1].height).toBe(colCells[2].y);
      expect(colCells[2].y + colCells[2].height).toBe(height);
    }
  });

  it("falls back to uniform slicing when offsets are the wrong length or malformed", () => {
    const uniform = createGridForDimensions(400, 200, 2, 2);
    const badLength = createGridForDimensions(400, 200, 2, 2, { colOffsets: [0.2, 0.5] });
    const badRange = createGridForDimensions(400, 200, 2, 2, { colOffsets: [1.5] });
    expect(badLength.cells).toEqual(uniform.cells);
    expect(badRange.cells).toEqual(uniform.cells);
  });
});
