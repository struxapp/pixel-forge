import { describe, expect, it } from 'vitest';
import { layoutSheet } from '../src/spritesheet';

describe('layoutSheet', () => {
  it('puts a short animation in one row', () => {
    const layout = layoutSheet(4, 16, 16);
    expect(layout).toMatchObject({ columns: 4, rows: 1, width: 64, height: 16 });
    expect(layout.cells.map((c) => c.x)).toEqual([0, 16, 32, 48]);
    expect(layout.cells.every((c) => c.y === 0)).toBe(true);
  });

  it('wraps after the column limit, left to right then top to bottom', () => {
    const layout = layoutSheet(10, 8, 12, 4);
    expect(layout).toMatchObject({ columns: 4, rows: 3, width: 32, height: 36 });
    expect(layout.cells[3]).toEqual({ x: 24, y: 0 });
    expect(layout.cells[4]).toEqual({ x: 0, y: 12 });
    expect(layout.cells[9]).toEqual({ x: 8, y: 24 });
  });

  it('scales cells and handles a single frame', () => {
    expect(layoutSheet(1, 16, 16, 8, 4)).toMatchObject({ columns: 1, rows: 1, width: 64, height: 64, cells: [{ x: 0, y: 0 }] });
    expect(layoutSheet(8, 16, 16, 8, 2)).toMatchObject({ columns: 8, rows: 1, width: 256, height: 32 });
  });
});
