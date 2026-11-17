import { describe, expect, it } from 'vitest';
import { TRANSPARENT, createFrame, resizeSprite } from '../src/model';
import { floodFill, linePoints, rectPoints, withMirror } from '../src/tools';

/** Builds a frame from rows of characters: '.' transparent, '#' = 0x111111, 'x' = 0xff0000. */
function frameFrom(rows: string[]) {
  const map: Record<string, number> = { '.': TRANSPARENT, '#': 0x111111, x: 0xff0000 };
  const frame = createFrame(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => (frame[y * row.length + x] = map[ch])));
  return frame;
}

function rowsOf(frame: Int32Array, width: number) {
  const back: Record<number, string> = { [TRANSPARENT]: '.', 0x111111: '#', 0xff0000: 'x', 0x00ff00: 'o' };
  const rows: string[] = [];
  for (let y = 0; y < frame.length / width; y += 1) {
    rows.push([...frame.slice(y * width, y * width + width)].map((c) => back[c] ?? '?').join(''));
  }
  return rows;
}

describe('floodFill', () => {
  it('fills the enclosed region only', () => {
    const frame = frameFrom(['......', '.####.', '.#..#.', '.#..#.', '.####.', '......']);
    const changed = floodFill(frame, 6, 6, 2, 2, 0x00ff00);
    expect(changed).toBe(4);
    expect(rowsOf(frame, 6)).toEqual(['......', '.####.', '.#oo#.', '.#oo#.', '.####.', '......']);
  });

  it('is 4-connected: it does not leak through diagonal gaps', () => {
    const frame = frameFrom(['.#..', '#...', '....', '....']);
    floodFill(frame, 4, 4, 0, 0, 0x00ff00);
    expect(rowsOf(frame, 4)).toEqual(['o#..', '#...', '....', '....']);
  });

  it('fills the outside around shapes, reaching every connected pixel', () => {
    const frame = frameFrom(['.....', '.###.', '.#.#.', '.###.', '.....']);
    const changed = floodFill(frame, 5, 5, 0, 0, 0x00ff00);
    expect(changed).toBe(16);
    expect(rowsOf(frame, 5)[2]).toBe('o#.#o');
  });

  it('does nothing when the colour is already there or the point is outside', () => {
    const frame = frameFrom(['xx', 'xx']);
    expect(floodFill(frame, 2, 2, 0, 0, 0xff0000)).toBe(0);
    expect(floodFill(frame, 2, 2, 5, 0, 0x00ff00)).toBe(0);
    expect(rowsOf(frame, 2)).toEqual(['xx', 'xx']);
  });

  it('handles a whole 64 × 64 canvas without recursion limits', () => {
    const frame = createFrame(64, 64);
    expect(floodFill(frame, 64, 64, 10, 10, 0x111111)).toBe(64 * 64);
  });
});

describe('line, rectangle and mirror', () => {
  it('draws Bresenham lines including both ends', () => {
    expect(linePoints(0, 0, 3, 0)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
    const diagonal = linePoints(0, 0, 4, 2);
    expect(diagonal[0]).toEqual({ x: 0, y: 0 });
    expect(diagonal.at(-1)).toEqual({ x: 4, y: 2 });
    expect(diagonal).toHaveLength(5);
    expect(linePoints(2, 2, 2, 2)).toEqual([{ x: 2, y: 2 }]);
  });

  it('draws outline and filled rectangles from any two corners', () => {
    expect(rectPoints(3, 3, 0, 0, false)).toHaveLength(12);
    expect(rectPoints(0, 0, 3, 3, true)).toHaveLength(16);
  });

  it('mirrors points across the vertical centre line without duplicates', () => {
    const mirrored = withMirror([{ x: 1, y: 2 }, { x: 2, y: 2 }], 4, true);
    expect(mirrored).toEqual([
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ]);
    expect(withMirror([{ x: 0, y: 0 }], 8, true)).toEqual([
      { x: 0, y: 0 },
      { x: 7, y: 0 },
    ]);
  });

  it('keeps the drawing centred when the canvas is resized', () => {
    const frame = frameFrom(['........', '........', '........', '...##...', '...##...', '........', '........', '........']);
    const bigger = resizeSprite({ width: 8, height: 8, frames: [frame] }, 16, 16);
    expect(bigger.frames[0][7 * 16 + 7]).toBe(0x111111);
    expect(bigger.frames[0][8 * 16 + 8]).toBe(0x111111);
    expect(bigger.frames[0].filter((c) => c !== TRANSPARENT)).toHaveLength(4);
  });
});
