export interface SheetLayout {
  columns: number;
  rows: number;
  width: number;
  height: number;
  /** Top-left corner of each frame, in sheet pixels. */
  cells: { x: number; y: number }[];
}

/**
 * Lays frames out left to right, top to bottom, wrapping after `maxColumns`.
 * A single row up to `maxColumns` frames keeps simple animations in a strip.
 */
export function layoutSheet(frameCount: number, frameWidth: number, frameHeight: number, maxColumns = 8, scale = 1): SheetLayout {
  const count = Math.max(1, Math.floor(frameCount));
  const columns = Math.min(count, Math.max(1, Math.floor(maxColumns)));
  const rows = Math.ceil(count / columns);
  const cellW = frameWidth * scale;
  const cellH = frameHeight * scale;
  const cells = Array.from({ length: count }, (_, i) => ({ x: (i % columns) * cellW, y: Math.floor(i / columns) * cellH }));
  return { columns, rows, width: columns * cellW, height: rows * cellH, cells };
}
