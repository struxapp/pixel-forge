import type { Frame } from './model';

export interface Point {
  x: number;
  y: number;
}

/**
 * 4-connected flood fill (scanline-free stack version). Replaces the contiguous region that has the
 * colour at (x, y) with `color`. Returns how many pixels changed.
 */
export function floodFill(frame: Frame, width: number, height: number, x: number, y: number, color: number): number {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  const target = frame[y * width + x];
  if (target === color) return 0;
  const stack: number[] = [y * width + x];
  let changed = 0;
  while (stack.length > 0) {
    const index = stack.pop() as number;
    if (frame[index] !== target) continue;
    frame[index] = color;
    changed += 1;
    const px = index % width;
    const py = (index - px) / width;
    if (px > 0) stack.push(index - 1);
    if (px < width - 1) stack.push(index + 1);
    if (py > 0) stack.push(index - width);
    if (py < height - 1) stack.push(index + width);
  }
  return changed;
}

/** Bresenham line between two pixels, both ends included. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): Point[] {
  const points: Point[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    points.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return points;
}

/** Pixels of an axis-aligned rectangle given two opposite corners. */
export function rectPoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): Point[] {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const points: Point[] = [];
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (filled || y === top || y === bottom || x === left || x === right) points.push({ x, y });
    }
  }
  return points;
}

/** Adds the horizontally mirrored twin of every point (deduplicated). */
export function withMirror(points: Point[], width: number, mirror: boolean): Point[] {
  if (!mirror) return points;
  const seen = new Set<number>();
  const out: Point[] = [];
  for (const p of points) {
    for (const q of [p, { x: width - 1 - p.x, y: p.y }]) {
      const key = q.y * 4096 + q.x;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(q);
      }
    }
  }
  return out;
}
