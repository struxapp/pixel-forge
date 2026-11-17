/** A pixel is 0xRRGGBB, or TRANSPARENT. */
export const TRANSPARENT = -1;

export type Frame = Int32Array;

export interface Sprite {
  width: number;
  height: number;
  frames: Frame[];
}

export const SIZES = [8, 16, 24, 32, 48, 64] as const;
export const MIN_SIZE = 8;
export const MAX_SIZE = 64;

export function createFrame(width: number, height: number): Frame {
  return new Int32Array(width * height).fill(TRANSPARENT);
}

export function createSprite(width: number, height: number, frameCount = 1): Sprite {
  return { width, height, frames: Array.from({ length: frameCount }, () => createFrame(width, height)) };
}

export function cloneSprite(sprite: Sprite): Sprite {
  return { width: sprite.width, height: sprite.height, frames: sprite.frames.map((f) => f.slice()) };
}

export function inBounds(sprite: Pick<Sprite, 'width' | 'height'>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < sprite.width && y < sprite.height;
}

/** Resizes every frame, keeping the drawing centred. */
export function resizeSprite(sprite: Sprite, width: number, height: number): Sprite {
  const dx = Math.floor((width - sprite.width) / 2);
  const dy = Math.floor((height - sprite.height) / 2);
  const frames = sprite.frames.map((frame) => {
    const next = createFrame(width, height);
    for (let y = 0; y < sprite.height; y += 1) {
      for (let x = 0; x < sprite.width; x += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height) next[ny * width + nx] = frame[y * sprite.width + x];
      }
    }
    return next;
  });
  return { width, height, frames };
}

export function colorToHex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function hexToColor(hex: string): number | null {
  const text = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(text)) {
    return Number.parseInt(
      text
        .split('')
        .map((c) => c + c)
        .join(''),
      16,
    );
  }
  if (!/^[0-9a-f]{6}$/i.test(text)) return null;
  return Number.parseInt(text, 16);
}
