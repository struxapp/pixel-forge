import './style.css';
import { EXAMPLE_FPS, createExampleSprite } from './example';
import { encodeGif } from './gif';
import { icons, logo } from './icons';
import {
  SIZES,
  TRANSPARENT,
  cloneSprite,
  colorToHex,
  createFrame,
  createSprite,
  hexToColor,
  inBounds,
  resizeSprite,
  type Frame,
  type Sprite,
} from './model';
import { CUSTOM_DEFAULT, CUSTOM_ID, CUSTOM_LIMIT, PRESETS } from './palettes';
import { layoutSheet } from './spritesheet';
import { loadProject, saveProject } from './storage';
import { initTheme, type Theme } from './theme';
import { floodFill, linePoints, rectPoints, withMirror, type Point } from './tools';

type Tool = 'pencil' | 'eraser' | 'fill' | 'line' | 'rect' | 'picker';

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'pencil', label: 'Pencil', key: 'B' },
  { id: 'eraser', label: 'Eraser', key: 'E' },
  { id: 'fill', label: 'Fill', key: 'G' },
  { id: 'line', label: 'Line', key: 'L' },
  { id: 'rect', label: 'Rectangle', key: 'R' },
  { id: 'picker', label: 'Colour picker', key: 'I' },
];

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};

/* ---------- state ---------- */

const saved = loadProject();
const state = {
  sprite: saved?.sprite ?? createExampleSprite(),
  frame: 0,
  tool: 'pencil' as Tool,
  color: 0x57d18b,
  mirror: false,
  onion: true,
  grid: true,
  fps: saved?.fps ?? EXAMPLE_FPS,
  playing: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  isExample: saved ? saved.isExample : true,
  paletteId: saved?.paletteId ?? 'forge16',
  custom: saved?.customPalette.length ? saved.customPalette : [...CUSTOM_DEFAULT],
};

const undoStack: { sprite: Sprite; frame: number }[] = [];
const redoStack: { sprite: Sprite; frame: number }[] = [];

function checkpoint(): void {
  undoStack.push({ sprite: cloneSprite(state.sprite), frame: state.frame });
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

function undo(): void {
  const prev = undoStack.pop();
  if (!prev) return;
  redoStack.push({ sprite: cloneSprite(state.sprite), frame: state.frame });
  state.sprite = prev.sprite;
  state.frame = Math.min(prev.frame, prev.sprite.frames.length - 1);
  afterStructureChange();
}

function redo(): void {
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push({ sprite: cloneSprite(state.sprite), frame: state.frame });
  state.sprite = next.sprite;
  state.frame = Math.min(next.frame, next.sprite.frames.length - 1);
  afterStructureChange();
}

/* ---------- elements ---------- */

const els = {
  canvas: $<HTMLCanvasElement>('canvas'),
  stage: $<HTMLDivElement>('stage'),
  toolButtons: $<HTMLDivElement>('tool-buttons'),
  mirror: $<HTMLButtonElement>('toggle-mirror'),
  onion: $<HTMLButtonElement>('toggle-onion'),
  grid: $<HTMLButtonElement>('toggle-grid'),
  undo: $<HTMLButtonElement>('undo'),
  redo: $<HTMLButtonElement>('redo'),
  saveStatus: $<HTMLSpanElement>('save-status'),
  theme: $<HTMLButtonElement>('theme'),
  banner: $<HTMLDivElement>('example-banner'),
  clearExample: $<HTMLButtonElement>('clear-example'),
  statusPos: $<HTMLSpanElement>('status-pos'),
  frameList: $<HTMLOListElement>('frame-list'),
  frameCount: $<HTMLSpanElement>('frame-count'),
  colourInput: $<HTMLInputElement>('colour-input'),
  currentFill: $<HTMLSpanElement>('current-fill'),
  hexInput: $<HTMLInputElement>('hex-input'),
  addColour: $<HTMLButtonElement>('add-colour'),
  paletteSelect: $<HTMLSelectElement>('palette-select'),
  swatches: $<HTMLDivElement>('swatches'),
  paletteNote: $<HTMLParagraphElement>('palette-note'),
  preview: $<HTMLCanvasElement>('preview'),
  play: $<HTMLButtonElement>('play'),
  fps: $<HTMLInputElement>('fps'),
  fpsOut: $<HTMLOutputElement>('fps-out'),
  exportDialog: $<HTMLDialogElement>('export-dialog'),
  exportSize: $<HTMLParagraphElement>('export-size'),
  exportScale: $<HTMLSelectElement>('export-scale'),
  exportGo: $<HTMLButtonElement>('export-go'),
  newDialog: $<HTMLDialogElement>('new-dialog'),
  newSize: $<HTMLSelectElement>('new-size'),
  toast: $<HTMLDivElement>('toast'),
};

for (const slot of document.querySelectorAll<HTMLElement>('[data-icon]')) {
  slot.outerHTML = icons[slot.dataset.icon as keyof typeof icons] ?? '';
}
$('brand-mark').innerHTML = logo;

let toastTimer = 0;
function toast(message: string): void {
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els.toast.classList.remove('is-visible'), 2000);
}

const currentFrame = (): Frame => state.sprite.frames[state.frame];

/* ---------- canvas rendering ---------- */

const ctx = els.canvas.getContext('2d') as CanvasRenderingContext2D;
let zoom = 16;
let hover: Point | null = null;
let keyCursor: Point | null = null;
let preview: Point[] = [];
let checker: CanvasPattern | null = null;
let checkerKey = '';

function themeColors(): { light: string; dark: string; grid: string; axis: string } {
  const style = getComputedStyle(document.documentElement);
  return {
    light: style.getPropertyValue('--check-a').trim() || '#ffffff',
    dark: style.getPropertyValue('--check-b').trim() || '#e5e5e5',
    grid: style.getPropertyValue('--grid-line').trim() || 'rgba(0,0,0,0.12)',
    axis: style.getPropertyValue('--accent').trim() || '#ff6b4a',
  };
}

function checkerPattern(cell: number, a: string, b: string): CanvasPattern | null {
  const key = `${cell}|${a}|${b}`;
  if (checker && checkerKey === key) return checker;
  const tile = document.createElement('canvas');
  tile.width = cell * 2;
  tile.height = cell * 2;
  const t = tile.getContext('2d');
  if (!t) return null;
  t.fillStyle = a;
  t.fillRect(0, 0, cell * 2, cell * 2);
  t.fillStyle = b;
  t.fillRect(cell, 0, cell, cell);
  t.fillRect(0, cell, cell, cell);
  checker = ctx.createPattern(tile, 'repeat');
  checkerKey = key;
  return checker;
}

function fitCanvas(): void {
  const { width, height } = state.sprite;
  const rect = els.stage.getBoundingClientRect();
  const availW = Math.max(64, rect.width - 24);
  const availH = Math.max(64, rect.height - 24);
  zoom = Math.max(2, Math.floor(Math.min(availW / width, availH / height)));
  const dpr = window.devicePixelRatio || 1;
  els.canvas.style.width = `${width * zoom}px`;
  els.canvas.style.height = `${height * zoom}px`;
  els.canvas.width = Math.round(width * zoom * dpr);
  els.canvas.height = Math.round(height * zoom * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderCanvas();
}

function drawFrame(target: CanvasRenderingContext2D, frame: Frame, width: number, size: number, alpha = 1): void {
  target.globalAlpha = alpha;
  for (let i = 0; i < frame.length; i += 1) {
    const c = frame[i];
    if (c === TRANSPARENT) continue;
    target.fillStyle = colorToHex(c);
    target.fillRect((i % width) * size, Math.floor(i / width) * size, size, size);
  }
  target.globalAlpha = 1;
}

function renderCanvas(): void {
  const { width, height, frames } = state.sprite;
  const w = width * zoom;
  const h = height * zoom;
  const colors = themeColors();
  ctx.clearRect(0, 0, w, h);
  const pattern = checkerPattern(Math.max(4, Math.round(zoom / 2)), colors.light, colors.dark);
  ctx.fillStyle = pattern ?? colors.light;
  ctx.fillRect(0, 0, w, h);

  if (state.onion && frames.length > 1) {
    if (state.frame > 0) drawFrame(ctx, frames[state.frame - 1], width, zoom, 0.28);
    if (state.frame < frames.length - 1) drawFrame(ctx, frames[state.frame + 1], width, zoom, 0.12);
  }
  drawFrame(ctx, currentFrame(), width, zoom);

  if (preview.length > 0) {
    ctx.globalAlpha = 0.9;
    for (const p of preview) {
      if (!inBounds(state.sprite, p.x, p.y)) continue;
      if (state.tool === 'eraser') ctx.clearRect(p.x * zoom, p.y * zoom, zoom, zoom);
      else {
        ctx.fillStyle = colorToHex(state.color);
        ctx.fillRect(p.x * zoom, p.y * zoom, zoom, zoom);
      }
    }
    ctx.globalAlpha = 1;
  }

  if (state.grid && zoom >= 6) {
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < width; x += 1) {
      ctx.moveTo(x * zoom + 0.5, 0);
      ctx.lineTo(x * zoom + 0.5, h);
    }
    for (let y = 1; y < height; y += 1) {
      ctx.moveTo(0, y * zoom + 0.5);
      ctx.lineTo(w, y * zoom + 0.5);
    }
    ctx.stroke();
  }

  if (state.mirror) {
    ctx.strokeStyle = colors.axis;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const cursor = keyCursor ?? hover;
  if (cursor) {
    const cells = withMirror([cursor], width, state.mirror);
    for (const c of cells) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeRect(c.x * zoom + 1, c.y * zoom + 1, zoom - 2, zoom - 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 1;
      ctx.strokeRect(c.x * zoom + 2.5, c.y * zoom + 2.5, zoom - 5, zoom - 5);
    }
  }
}

/* ---------- drawing ---------- */

function plot(points: Point[], color: number): void {
  const frame = currentFrame();
  for (const p of withMirror(points, state.sprite.width, state.mirror)) {
    if (inBounds(state.sprite, p.x, p.y)) frame[p.y * state.sprite.width + p.x] = color;
  }
}

function pixelAt(event: PointerEvent | MouseEvent): Point {
  const rect = els.canvas.getBoundingClientRect();
  return {
    x: Math.floor(((event.clientX - rect.left) / rect.width) * state.sprite.width),
    y: Math.floor(((event.clientY - rect.top) / rect.height) * state.sprite.height),
  };
}

let stroke: { tool: Tool; color: number; start: Point; last: Point; filled: boolean } | null = null;

function pickColor(p: Point): void {
  if (!inBounds(state.sprite, p.x, p.y)) return;
  const c = currentFrame()[p.y * state.sprite.width + p.x];
  if (c === TRANSPARENT) {
    toast('That pixel is transparent');
    return;
  }
  setColor(c);
  setTool('pencil');
  toast(`Picked ${colorToHex(c).toUpperCase()}`);
}

function fillAt(p: Point, color: number): boolean {
  const { width, height } = state.sprite;
  const frame = currentFrame();
  let changed = floodFill(frame, width, height, p.x, p.y, color);
  if (state.mirror) changed += floodFill(frame, width, height, width - 1 - p.x, p.y, color);
  return changed > 0;
}

function shapePoints(tool: Tool, a: Point, b: Point, filled: boolean): Point[] {
  return tool === 'rect' ? rectPoints(a.x, a.y, b.x, b.y, filled) : linePoints(a.x, a.y, b.x, b.y);
}

function beginStroke(p: Point, erase: boolean, filled: boolean): void {
  const tool: Tool = erase ? 'eraser' : state.tool;
  const color = tool === 'eraser' ? TRANSPARENT : state.color;
  if (tool === 'picker') {
    pickColor(p);
    return;
  }
  if (tool === 'fill') {
    if (!inBounds(state.sprite, p.x, p.y)) return;
    checkpoint();
    if (fillAt(p, color)) afterPixelsChange();
    else undoStack.pop();
    updateHistoryButtons();
    return;
  }
  checkpoint();
  stroke = { tool, color, start: p, last: p, filled };
  if (tool === 'pencil' || tool === 'eraser') {
    plot([p], color);
    renderCanvas();
  } else {
    preview = withMirror(shapePoints(tool, p, p, filled), state.sprite.width, state.mirror);
    renderCanvas();
  }
}

function moveStroke(p: Point, filled: boolean): void {
  if (!stroke) return;
  if (stroke.tool === 'pencil' || stroke.tool === 'eraser') {
    plot(linePoints(stroke.last.x, stroke.last.y, p.x, p.y), stroke.color);
  } else {
    stroke.filled = filled;
    preview = withMirror(shapePoints(stroke.tool, stroke.start, p, filled), state.sprite.width, state.mirror);
  }
  stroke.last = p;
  renderCanvas();
}

function endStroke(): void {
  if (!stroke) return;
  if (stroke.tool === 'line' || stroke.tool === 'rect') {
    plot(shapePoints(stroke.tool, stroke.start, stroke.last, stroke.filled), stroke.color);
    preview = [];
  }
  stroke = null;
  afterPixelsChange();
}

els.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
els.canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 && event.button !== 2) return;
  event.preventDefault();
  keyCursor = null;
  els.canvas.setPointerCapture(event.pointerId);
  beginStroke(pixelAt(event), event.button === 2, event.shiftKey);
});
els.canvas.addEventListener('pointermove', (event) => {
  const p = pixelAt(event);
  const inside = inBounds(state.sprite, p.x, p.y);
  const changed = !hover || hover.x !== p.x || hover.y !== p.y;
  hover = inside ? p : null;
  if (stroke) moveStroke(p, event.shiftKey);
  else if (changed) renderCanvas();
  if (changed) els.statusPos.textContent = inside ? `x ${p.x}, y ${p.y}` : sizeLabel();
});
els.canvas.addEventListener('pointerup', () => endStroke());
els.canvas.addEventListener('pointercancel', () => endStroke());
els.canvas.addEventListener('pointerleave', () => {
  if (!stroke) {
    hover = null;
    renderCanvas();
    els.statusPos.textContent = sizeLabel();
  }
});

/* Keyboard drawing: arrows move a cursor, Space/Enter applies the tool. */
let keyAnchor: Point | null = null;
els.canvas.addEventListener('focus', () => {
  if (!keyCursor) keyCursor = { x: Math.floor(state.sprite.width / 2), y: Math.floor(state.sprite.height / 2) };
  renderCanvas();
});
els.canvas.addEventListener('blur', () => {
  keyCursor = null;
  keyAnchor = null;
  preview = [];
  renderCanvas();
});
els.canvas.addEventListener('keydown', (event) => {
  if (!keyCursor) keyCursor = { x: 0, y: 0 };
  const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const move = moves[event.key];
  if (move) {
    event.preventDefault();
    keyCursor = {
      x: Math.min(state.sprite.width - 1, Math.max(0, keyCursor.x + move[0])),
      y: Math.min(state.sprite.height - 1, Math.max(0, keyCursor.y + move[1])),
    };
    if (keyAnchor && (state.tool === 'line' || state.tool === 'rect')) {
      preview = withMirror(shapePoints(state.tool, keyAnchor, keyCursor, event.shiftKey), state.sprite.width, state.mirror);
    }
    els.statusPos.textContent = `x ${keyCursor.x}, y ${keyCursor.y}`;
    renderCanvas();
    return;
  }
  if (event.key === 'Escape' && keyAnchor) {
    event.preventDefault();
    keyAnchor = null;
    preview = [];
    renderCanvas();
    return;
  }
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    const p = keyCursor;
    if (state.tool === 'line' || state.tool === 'rect') {
      if (!keyAnchor) {
        keyAnchor = p;
        preview = withMirror(shapePoints(state.tool, p, p, event.shiftKey), state.sprite.width, state.mirror);
        els.statusPos.textContent = `Start set at x ${p.x}, y ${p.y}. Move and press Space again to draw.`;
        renderCanvas();
      } else {
        checkpoint();
        plot(shapePoints(state.tool, keyAnchor, p, event.shiftKey), state.color);
        keyAnchor = null;
        preview = [];
        afterPixelsChange();
      }
      return;
    }
    beginStroke(p, false, event.shiftKey);
    endStroke();
  }
});

/* ---------- tools and toggles ---------- */

els.toolButtons.innerHTML = TOOLS.map(
  (t) =>
    `<button type="button" class="tool" data-tool="${t.id}" aria-pressed="false" aria-label="${t.label}" title="${t.label} (${t.key})">${icons[t.id]}<span class="tool-key" aria-hidden="true">${t.key}</span></button>`,
).join('');

function setTool(tool: Tool): void {
  state.tool = tool;
  keyAnchor = null;
  preview = [];
  for (const b of els.toolButtons.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
    b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
  }
  els.canvas.dataset.tool = tool;
  renderCanvas();
}

els.toolButtons.addEventListener('click', (event) => {
  const b = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tool]');
  if (b) setTool(b.dataset.tool as Tool);
});

function setToggle(button: HTMLButtonElement, on: boolean): void {
  button.setAttribute('aria-pressed', String(on));
}

els.mirror.addEventListener('click', () => {
  state.mirror = !state.mirror;
  setToggle(els.mirror, state.mirror);
  renderCanvas();
});
els.onion.addEventListener('click', () => {
  state.onion = !state.onion;
  setToggle(els.onion, state.onion);
  renderCanvas();
});
els.grid.addEventListener('click', () => {
  state.grid = !state.grid;
  setToggle(els.grid, state.grid);
  renderCanvas();
});

/* ---------- colour and palette ---------- */

function setColor(color: number): void {
  state.color = color;
  const hex = colorToHex(color);
  els.currentFill.style.background = hex;
  els.colourInput.value = hex;
  if (document.activeElement !== els.hexInput) els.hexInput.value = hex.toUpperCase();
  for (const s of els.swatches.querySelectorAll<HTMLButtonElement>('[data-color]')) {
    s.setAttribute('aria-pressed', String(s.dataset.color === hex));
  }
  if (state.tool === 'eraser' || state.tool === 'picker') setTool('pencil');
}

function paletteColors(): string[] {
  if (state.paletteId === CUSTOM_ID) return state.custom;
  return (PRESETS.find((p) => p.id === state.paletteId) ?? PRESETS[0]).colors;
}

els.paletteSelect.innerHTML = [
  ...PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`),
  `<option value="${CUSTOM_ID}">My palette</option>`,
].join('');

function renderPalette(): void {
  els.paletteSelect.value = state.paletteId;
  const colors = paletteColors();
  const current = colorToHex(state.color);
  els.swatches.innerHTML = colors
    .map(
      (hex) =>
        `<button type="button" class="swatch" data-color="${hex}" style="--swatch:${hex}" aria-label="Use ${hex.toUpperCase()}" aria-pressed="${hex === current}" title="${hex.toUpperCase()}"></button>`,
    )
    .join('');
  const custom = state.paletteId === CUSTOM_ID;
  els.paletteNote.textContent = custom
    ? `${colors.length} of ${CUSTOM_LIMIT} colours. Add the current colour with +; Delete removes a focused colour.`
    : 'Click a colour to draw with it. Pick any colour above and add it to My palette.';
}

els.paletteSelect.addEventListener('change', () => {
  state.paletteId = els.paletteSelect.value;
  renderPalette();
  scheduleSave();
});
els.swatches.addEventListener('click', (event) => {
  const s = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-color]');
  if (s) setColor(hexToColor(s.dataset.color ?? '') ?? state.color);
});
els.swatches.addEventListener('keydown', (event) => {
  const s = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-color]');
  if (!s || state.paletteId !== CUSTOM_ID || (event.key !== 'Delete' && event.key !== 'Backspace')) return;
  event.preventDefault();
  const index = state.custom.indexOf(s.dataset.color ?? '');
  if (index < 0) return;
  state.custom.splice(index, 1);
  renderPalette();
  scheduleSave();
  const buttons = els.swatches.querySelectorAll<HTMLButtonElement>('[data-color]');
  buttons[Math.min(index, buttons.length - 1)]?.focus();
  toast('Colour removed from My palette');
});

els.addColour.addEventListener('click', () => {
  const hex = colorToHex(state.color);
  if (state.custom.includes(hex)) {
    toast('Already in My palette');
  } else if (state.custom.length >= CUSTOM_LIMIT) {
    toast(`My palette holds up to ${CUSTOM_LIMIT} colours`);
  } else {
    state.custom.push(hex);
    toast(`${hex.toUpperCase()} added to My palette`);
  }
  state.paletteId = CUSTOM_ID;
  renderPalette();
  scheduleSave();
});

els.colourInput.addEventListener('input', () => {
  const c = hexToColor(els.colourInput.value);
  if (c !== null) setColor(c);
});
els.hexInput.addEventListener('change', () => {
  const c = hexToColor(els.hexInput.value);
  if (c === null) {
    els.hexInput.setAttribute('aria-invalid', 'true');
    toast('Use a hex colour like #57D18B');
    return;
  }
  els.hexInput.removeAttribute('aria-invalid');
  setColor(c);
  els.hexInput.value = colorToHex(c).toUpperCase();
});

/* ---------- frames ---------- */

function drawThumb(canvas: HTMLCanvasElement, frame: Frame): void {
  const { width, height } = state.sprite;
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d');
  if (!c) return;
  const image = c.createImageData(width, height);
  for (let i = 0; i < frame.length; i += 1) {
    const color = frame[i];
    if (color === TRANSPARENT) continue;
    image.data[i * 4] = (color >> 16) & 255;
    image.data[i * 4 + 1] = (color >> 8) & 255;
    image.data[i * 4 + 2] = color & 255;
    image.data[i * 4 + 3] = 255;
  }
  c.putImageData(image, 0, 0);
}

function renderFrames(): void {
  const { frames } = state.sprite;
  els.frameCount.textContent = String(frames.length);
  els.frameList.innerHTML = frames
    .map(
      (_, i) =>
        `<li><button type="button" class="frame${i === state.frame ? ' is-current' : ''}" data-frame="${i}" aria-current="${i === state.frame ? 'true' : 'false'}" aria-label="Frame ${i + 1}"><canvas class="thumb" aria-hidden="true"></canvas><span class="frame-num" aria-hidden="true">${i + 1}</span></button></li>`,
    )
    .join('');
  els.frameList.querySelectorAll<HTMLCanvasElement>('canvas').forEach((c, i) => drawThumb(c, frames[i]));
  els.frameList.querySelector('.is-current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  $<HTMLButtonElement>('frame-del').disabled = frames.length <= 1;
  $<HTMLButtonElement>('frame-left').disabled = state.frame === 0;
  $<HTMLButtonElement>('frame-right').disabled = state.frame === frames.length - 1;
}

function updateCurrentThumb(): void {
  const canvas = els.frameList.querySelector<HTMLCanvasElement>(`[data-frame="${state.frame}"] canvas`);
  if (canvas) drawThumb(canvas, currentFrame());
}

function selectFrame(index: number): void {
  state.frame = Math.max(0, Math.min(state.sprite.frames.length - 1, index));
  renderFrames();
  renderCanvas();
}

els.frameList.addEventListener('click', (event) => {
  const b = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-frame]');
  if (!b) return;
  selectFrame(Number(b.dataset.frame));
  els.frameList.querySelector<HTMLButtonElement>(`[data-frame="${state.frame}"]`)?.focus();
});

function structural(change: () => void): void {
  checkpoint();
  change();
  afterStructureChange();
}

$('frame-add').addEventListener('click', () =>
  structural(() => {
    state.sprite.frames.splice(state.frame + 1, 0, createFrame(state.sprite.width, state.sprite.height));
    state.frame += 1;
  }),
);
$('frame-dup').addEventListener('click', () =>
  structural(() => {
    state.sprite.frames.splice(state.frame + 1, 0, currentFrame().slice());
    state.frame += 1;
  }),
);
$('frame-del').addEventListener('click', () => {
  if (state.sprite.frames.length <= 1) return;
  structural(() => {
    state.sprite.frames.splice(state.frame, 1);
    state.frame = Math.min(state.frame, state.sprite.frames.length - 1);
  });
});
const moveFrame = (delta: number): void => {
  const to = state.frame + delta;
  if (to < 0 || to >= state.sprite.frames.length) return;
  structural(() => {
    const frames = state.sprite.frames;
    [frames[state.frame], frames[to]] = [frames[to], frames[state.frame]];
    state.frame = to;
  });
};
$('frame-left').addEventListener('click', () => moveFrame(-1));
$('frame-right').addEventListener('click', () => moveFrame(1));

/* ---------- preview animation ---------- */

const previewCtx = els.preview.getContext('2d');
let previewIndex = 0;
let lastTick = 0;

function drawPreview(): void {
  if (!previewCtx) return;
  const { width, height, frames } = state.sprite;
  if (els.preview.width !== width || els.preview.height !== height) {
    els.preview.width = width;
    els.preview.height = height;
  }
  previewCtx.clearRect(0, 0, width, height);
  drawFrame(previewCtx, frames[previewIndex % frames.length], width, 1);
}

function tick(time: number): void {
  if (state.playing) {
    const interval = 1000 / state.fps;
    if (time - lastTick >= interval) {
      lastTick = time - ((time - lastTick) % interval);
      previewIndex = (previewIndex + 1) % state.sprite.frames.length;
      drawPreview();
    }
  }
  window.requestAnimationFrame(tick);
}

function renderPlayButton(): void {
  els.play.innerHTML = state.playing ? icons.pause : icons.play;
  els.play.setAttribute('aria-label', state.playing ? 'Pause preview' : 'Play preview');
}

els.play.addEventListener('click', () => {
  state.playing = !state.playing;
  if (!state.playing) {
    previewIndex = state.frame;
    drawPreview();
  }
  renderPlayButton();
});

els.fps.value = String(state.fps);
els.fpsOut.textContent = `${state.fps} fps`;
els.fps.addEventListener('input', () => {
  state.fps = Number(els.fps.value);
  els.fpsOut.textContent = `${state.fps} fps`;
  scheduleSave();
});

/* ---------- saving ---------- */

let saveTimer = 0;
function scheduleSave(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const ok = saveProject({
      sprite: state.sprite,
      fps: state.fps,
      isExample: state.isExample,
      customPalette: state.custom,
      paletteId: state.paletteId,
    });
    els.saveStatus.textContent = ok ? 'Saved in this browser' : 'Not saved: browser storage is unavailable';
    els.saveStatus.classList.toggle('is-warning', !ok);
  }, 400);
}

/* ---------- change hooks ---------- */

const sizeLabel = (): string => `${state.sprite.width} × ${state.sprite.height}`;

function markEdited(): void {
  if (state.isExample) {
    state.isExample = false;
    els.banner.hidden = true;
  }
}

function afterPixelsChange(): void {
  markEdited();
  renderCanvas();
  updateCurrentThumb();
  if (!state.playing) {
    previewIndex = state.frame;
    drawPreview();
  }
  updateHistoryButtons();
  scheduleSave();
}

function afterStructureChange(): void {
  els.banner.hidden = !state.isExample;
  fitCanvas();
  renderFrames();
  previewIndex = Math.min(previewIndex, state.sprite.frames.length - 1);
  drawPreview();
  els.statusPos.textContent = sizeLabel();
  updateHistoryButtons();
  scheduleSave();
}

function updateHistoryButtons(): void {
  els.undo.disabled = undoStack.length === 0;
  els.redo.disabled = redoStack.length === 0;
}

els.undo.addEventListener('click', undo);
els.redo.addEventListener('click', redo);

/* ---------- new canvas and example ---------- */

els.newSize.innerHTML = SIZES.map((s) => `<option value="${s}">${s} × ${s}</option>`).join('');

$('new-btn').addEventListener('click', () => {
  els.newSize.value = String(state.sprite.width);
  els.newDialog.showModal();
});

els.newDialog.addEventListener('close', () => {
  const choice = els.newDialog.returnValue;
  const size = Number(els.newSize.value);
  if (choice === 'blank') {
    checkpoint();
    state.sprite = createSprite(size, size);
    state.frame = 0;
    state.isExample = false;
    afterStructureChange();
    toast(`New ${size} × ${size} canvas`);
  } else if (choice === 'resize') {
    checkpoint();
    state.sprite = resizeSprite(state.sprite, size, size);
    markEdited();
    afterStructureChange();
    toast(`Canvas resized to ${size} × ${size}`);
  }
  els.newDialog.returnValue = '';
});

els.clearExample.addEventListener('click', () => {
  checkpoint();
  state.sprite = createSprite(state.sprite.width, state.sprite.height);
  state.frame = 0;
  state.isExample = false;
  afterStructureChange();
  els.canvas.focus();
  toast('Example cleared. Undo brings it back.');
});

/* ---------- export ---------- */

function exportFormat(): 'png' | 'sheet' | 'gif' {
  const checked = els.exportDialog.querySelector<HTMLInputElement>('input[name="format"]:checked');
  return (checked?.value as 'png' | 'sheet' | 'gif') ?? 'png';
}

function updateExportSize(): void {
  const scale = Number(els.exportScale.value);
  const { width, height, frames } = state.sprite;
  const format = exportFormat();
  if (format === 'sheet') {
    const layout = layoutSheet(frames.length, width, height, 8, scale);
    els.exportSize.textContent = `${layout.width} × ${layout.height} px · ${layout.columns} × ${layout.rows} frames`;
  } else if (format === 'gif') {
    els.exportSize.textContent = `${width * scale} × ${height * scale} px · ${frames.length} frames at ${state.fps} fps`;
  } else {
    els.exportSize.textContent = `${width * scale} × ${height * scale} px · frame ${state.frame + 1}`;
  }
}

els.exportDialog.addEventListener('change', updateExportSize);

$('export-btn').addEventListener('click', () => {
  updateExportSize();
  els.exportDialog.showModal();
});

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png');
  });
}

async function runExport(): Promise<void> {
  const scale = Number(els.exportScale.value);
  const { width, height, frames } = state.sprite;
  const format = exportFormat();
  if (format === 'gif') {
    const bytes = encodeGif({ width, height, frames, delayCs: Math.round(100 / state.fps), scale });
    download(new Blob([bytes as BlobPart], { type: 'image/gif' }), `pixel-forge-${width}x${height}.gif`);
    return;
  }
  const out = document.createElement('canvas');
  const c = out.getContext('2d');
  if (!c) throw new Error('Canvas unavailable');
  if (format === 'sheet') {
    const layout = layoutSheet(frames.length, width, height, 8, scale);
    out.width = layout.width;
    out.height = layout.height;
    frames.forEach((frame, i) => {
      c.save();
      c.translate(layout.cells[i].x, layout.cells[i].y);
      drawFrame(c, frame, width, scale);
      c.restore();
    });
    download(await canvasToBlob(out), `pixel-forge-sheet-${frames.length}f.png`);
  } else {
    out.width = width * scale;
    out.height = height * scale;
    drawFrame(c, currentFrame(), width, scale);
    download(await canvasToBlob(out), `pixel-forge-frame-${state.frame + 1}.png`);
  }
}

els.exportGo.addEventListener('click', () => {
  runExport()
    .then(() => {
      els.exportDialog.close('done');
      toast('Download started');
    })
    .catch(() => toast('Export failed in this browser'));
});

/* ---------- keyboard shortcuts ---------- */

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || els.exportDialog.open || els.newDialog.open) return;
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (mod && !isTyping(event.target)) {
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      undo();
    } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault();
      redo();
    }
    return;
  }
  if (mod || event.altKey || isTyping(event.target)) return;
  const tool = TOOLS.find((t) => t.key.toLowerCase() === key);
  if (tool) setTool(tool.id);
  else if (key === 'm') els.mirror.click();
  else if (key === 'o') els.onion.click();
  else if (key === 'h') els.grid.click();
  else if (key === 'p') els.play.click();
  else if (event.key === ',') selectFrame(state.frame - 1);
  else if (event.key === '.') selectFrame(state.frame + 1);
});

/* ---------- theme and start ---------- */

const toggleTheme = initTheme((theme: Theme) => {
  els.theme.innerHTML = theme === 'dark' ? icons.sun : icons.moon;
  els.theme.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = theme === 'dark' ? '#121019' : '#f3f1ec';
  }
  checker = null;
  renderCanvas();
});
els.theme.addEventListener('click', toggleTheme);

new ResizeObserver(() => fitCanvas()).observe(els.stage);

setTool('pencil');
setToggle(els.onion, state.onion);
setToggle(els.grid, state.grid);
renderPalette();
setColor(state.color);
renderPlayButton();
els.banner.hidden = !state.isExample;
els.statusPos.textContent = sizeLabel();
els.saveStatus.textContent = saved ? 'Saved in this browser' : 'Changes save in this browser';
fitCanvas();
renderFrames();
drawPreview();
updateHistoryButtons();
window.requestAnimationFrame(tick);
