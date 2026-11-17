import { MAX_SIZE, MIN_SIZE, TRANSPARENT, type Frame, type Sprite } from './model';

export interface SavedProject {
  sprite: Sprite;
  fps: number;
  isExample: boolean;
  customPalette: string[];
  paletteId: string;
}

interface StoredShape {
  v: 1;
  w: number;
  h: number;
  fps: number;
  example: boolean;
  frames: string[];
  custom: string[];
  palette: string;
}

/** Run-length encodes a frame as "count*rrggbb" tokens ("-" for transparent), comma separated. */
export function encodeFrame(frame: Frame): string {
  const tokens: string[] = [];
  let i = 0;
  while (i < frame.length) {
    const color = frame[i];
    let run = 1;
    while (i + run < frame.length && frame[i + run] === color) run += 1;
    const value = color === TRANSPARENT ? '-' : (color & 0xffffff).toString(16).padStart(6, '0');
    tokens.push(run === 1 ? value : `${run}*${value}`);
    i += run;
  }
  return tokens.join(',');
}

export function decodeFrame(text: string, length: number): Frame | null {
  const frame = new Int32Array(length).fill(TRANSPARENT);
  let i = 0;
  for (const token of text.split(',')) {
    const star = token.indexOf('*');
    const run = star === -1 ? 1 : Number.parseInt(token.slice(0, star), 10);
    const value = star === -1 ? token : token.slice(star + 1);
    if (!Number.isInteger(run) || run < 1) return null;
    let color: number;
    if (value === '-') color = TRANSPARENT;
    else if (/^[0-9a-f]{6}$/.test(value)) color = Number.parseInt(value, 16);
    else return null;
    if (i + run > length) return null;
    frame.fill(color, i, i + run);
    i += run;
  }
  return i === length ? frame : null;
}

export function serializeProject(project: SavedProject): string {
  const data: StoredShape = {
    v: 1,
    w: project.sprite.width,
    h: project.sprite.height,
    fps: project.fps,
    example: project.isExample,
    frames: project.sprite.frames.map(encodeFrame),
    custom: project.customPalette,
    palette: project.paletteId,
  };
  return JSON.stringify(data);
}

export function deserializeProject(text: string): SavedProject | null {
  let data: Partial<StoredShape>;
  try {
    data = JSON.parse(text) as Partial<StoredShape>;
  } catch {
    return null;
  }
  if (!data || data.v !== 1) return null;
  const { w, h } = data;
  if (!Number.isInteger(w) || !Number.isInteger(h)) return null;
  const width = w as number;
  const height = h as number;
  if (width < MIN_SIZE || width > MAX_SIZE || height < MIN_SIZE || height > MAX_SIZE) return null;
  if (!Array.isArray(data.frames) || data.frames.length === 0 || data.frames.length > 256) return null;
  const frames: Frame[] = [];
  for (const text of data.frames) {
    if (typeof text !== 'string') return null;
    const frame = decodeFrame(text, width * height);
    if (!frame) return null;
    frames.push(frame);
  }
  const fps = typeof data.fps === 'number' && data.fps >= 1 && data.fps <= 30 ? Math.round(data.fps) : 8;
  const custom = Array.isArray(data.custom) ? data.custom.filter((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) : [];
  return {
    sprite: { width, height, frames },
    fps,
    isExample: data.example === true,
    customPalette: custom,
    paletteId: typeof data.palette === 'string' ? data.palette : 'forge16',
  };
}

const KEY = 'pixel-forge:project';

export function loadProject(): SavedProject | null {
  try {
    const text = window.localStorage.getItem(KEY);
    return text ? deserializeProject(text) : null;
  } catch {
    return null;
  }
}

/** Returns false when storage is unavailable or full. */
export function saveProject(project: SavedProject): boolean {
  try {
    window.localStorage.setItem(KEY, serializeProject(project));
    return true;
  } catch {
    return false;
  }
}
