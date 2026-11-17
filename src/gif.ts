import { TRANSPARENT, type Frame } from './model';

/**
 * A small animated GIF (GIF89a) encoder for pixel art: one global colour table, LZW-compressed frames,
 * a transparent colour, a per-frame delay and a NETSCAPE2.0 loop block.
 */

export interface GifOptions {
  width: number;
  height: number;
  frames: Frame[];
  /** Delay between frames in hundredths of a second (GIF's unit). */
  delayCs: number;
  /** Integer upscale factor (nearest neighbour). */
  scale?: number;
  /** 0 = loop forever. */
  loops?: number;
}

class ByteWriter {
  private bytes: number[] = [];

  byte(value: number): void {
    this.bytes.push(value & 0xff);
  }

  u16(value: number): void {
    this.byte(value);
    this.byte(value >> 8);
  }

  ascii(text: string): void {
    for (let i = 0; i < text.length; i += 1) this.byte(text.charCodeAt(i));
  }

  array(values: ArrayLike<number>): void {
    for (let i = 0; i < values.length; i += 1) this.byte(values[i]);
  }

  result(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export interface ColorTable {
  colors: number[];
  transparentIndex: number;
  indexOf: (color: number) => number;
}

/** Collects the colours used across all frames. Index 0 is reserved for transparency. */
export function buildColorTable(frames: Frame[]): ColorTable {
  const seen = new Map<number, number>();
  const colors: number[] = [0x000000];
  const order: number[] = [];
  for (const frame of frames) {
    for (let i = 0; i < frame.length; i += 1) {
      const c = frame[i];
      if (c !== TRANSPARENT && !seen.has(c)) {
        seen.set(c, -1);
        order.push(c);
      }
    }
  }
  // Up to 255 colours fit beside transparency; pixel art almost always does. Extra colours map to the nearest.
  const kept = order.slice(0, 255);
  for (const c of kept) {
    seen.set(c, colors.length);
    colors.push(c);
  }
  const nearest = (color: number): number => {
    let best = 1;
    let bestDist = Infinity;
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;
    for (let i = 1; i < colors.length; i += 1) {
      const c = colors[i];
      const d = (((c >> 16) & 255) - r) ** 2 + (((c >> 8) & 255) - g) ** 2 + ((c & 255) - b) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  };
  return {
    colors,
    transparentIndex: 0,
    indexOf: (color: number) => {
      if (color === TRANSPARENT) return 0;
      const index = seen.get(color) ?? -1;
      if (index > 0) return index;
      const near = nearest(color);
      seen.set(color, near);
      return near;
    },
  };
}

/** GIF-flavoured LZW: variable code size up to 12 bits, LSB-first bit packing. */
export function lzwEncode(indices: ArrayLike<number>, minCodeSize: number): Uint8Array {
  const out: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  let table = new Map<number, number>();

  const emit = (code: number): void => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };

  emit(clearCode);
  if (indices.length === 0) {
    emit(eoiCode);
    if (bitCount > 0) out.push(bitBuffer & 0xff);
    return Uint8Array.from(out);
  }

  let prefix = indices[0];
  for (let i = 1; i < indices.length; i += 1) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const found = table.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (nextCode === 4096) {
      emit(clearCode);
      table = new Map();
      codeSize = minCodeSize + 1;
      nextCode = eoiCode + 1;
    } else {
      if (nextCode >= 1 << codeSize) codeSize += 1;
      table.set(key, nextCode);
      nextCode += 1;
    }
    prefix = k;
  }
  emit(prefix);
  // The decoder adds one more table entry after reading the last code; if that fills the current
  // code width it reads the end code one bit wider, so the encoder must widen here too.
  if (nextCode >= 1 << codeSize && codeSize < 12) codeSize += 1;
  emit(eoiCode);
  if (bitCount > 0) out.push(bitBuffer & 0xff);
  return Uint8Array.from(out);
}

function scaleIndices(indices: Uint8Array, width: number, height: number, scale: number): Uint8Array {
  if (scale === 1) return indices;
  const w = width * scale;
  const out = new Uint8Array(w * height * scale);
  for (let y = 0; y < height * scale; y += 1) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < w; x += 1) out[y * w + x] = indices[sy * width + Math.floor(x / scale)];
  }
  return out;
}

export function encodeGif({ width, height, frames, delayCs, scale = 1, loops = 0 }: GifOptions): Uint8Array {
  const s = Math.max(1, Math.floor(scale));
  const outW = width * s;
  const outH = height * s;
  const table = buildColorTable(frames);

  // The colour table length must be a power of two, at least 2.
  let tableBits = 1;
  while (1 << tableBits < table.colors.length) tableBits += 1;
  const tableSize = 1 << tableBits;
  const minCodeSize = Math.max(2, tableBits);

  const w = new ByteWriter();
  w.ascii('GIF89a');
  w.u16(outW);
  w.u16(outH);
  w.byte(0x80 | (0x07 << 4) | (tableBits - 1)); // global table, 8-bit colour resolution, table size
  w.byte(table.transparentIndex); // background colour index
  w.byte(0); // pixel aspect ratio: not given
  for (let i = 0; i < tableSize; i += 1) {
    const c = table.colors[i] ?? 0;
    w.byte(c >> 16);
    w.byte(c >> 8);
    w.byte(c);
  }

  if (frames.length > 1) {
    w.byte(0x21);
    w.byte(0xff);
    w.byte(11);
    w.ascii('NETSCAPE2.0');
    w.byte(3);
    w.byte(1);
    w.u16(loops);
    w.byte(0);
  }

  const delay = Math.max(2, Math.round(delayCs));
  for (const frame of frames) {
    // Graphic control extension: disposal 2 (restore to background) so transparent pixels stay clear.
    w.byte(0x21);
    w.byte(0xf9);
    w.byte(4);
    w.byte((2 << 2) | 1);
    w.u16(delay);
    w.byte(table.transparentIndex);
    w.byte(0);

    // Image descriptor: whole canvas, no local table, not interlaced.
    w.byte(0x2c);
    w.u16(0);
    w.u16(0);
    w.u16(outW);
    w.u16(outH);
    w.byte(0);

    const indices = new Uint8Array(frame.length);
    for (let i = 0; i < frame.length; i += 1) indices[i] = table.indexOf(frame[i]);
    const data = lzwEncode(scaleIndices(indices, width, height, s), minCodeSize);
    w.byte(minCodeSize);
    for (let offset = 0; offset < data.length; offset += 255) {
      const block = data.subarray(offset, offset + 255);
      w.byte(block.length);
      w.array(block);
    }
    w.byte(0);
  }

  w.byte(0x3b);
  return w.result();
}
