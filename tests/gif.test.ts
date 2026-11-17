import { describe, expect, it } from 'vitest';
import { buildColorTable, encodeGif, lzwEncode } from '../src/gif';
import { TRANSPARENT, createFrame } from '../src/model';
import { createExampleSprite } from '../src/example';

const u16 = (bytes: Uint8Array, at: number) => bytes[at] | (bytes[at + 1] << 8);
const ascii = (bytes: Uint8Array, from: number, length: number) => String.fromCharCode(...bytes.slice(from, from + length));

/** Reference GIF LZW decoder, written independently for the tests. */
function lzwDecode(data: Uint8Array, minCodeSize: number, expected: number): number[] {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let dict: number[][] = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < clear; i += 1) dict.push([i]);
    dict.push([], []);
    codeSize = minCodeSize + 1;
  };
  reset();
  const out: number[] = [];
  let bitPos = 0;
  let prev: number[] | null = null;
  while (out.length <= expected) {
    let code = 0;
    for (let i = 0; i < codeSize; i += 1) {
      const byte = data[(bitPos + i) >> 3];
      if (byte === undefined) throw new Error('ran out of data');
      code |= ((byte >> ((bitPos + i) & 7)) & 1) << i;
    }
    bitPos += codeSize;
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    if (code === eoi) break;
    let entry: number[];
    if (code < dict.length) entry = dict[code];
    else if (code === dict.length && prev) entry = [...prev, prev[0]];
    else throw new Error(`bad code ${code}`);
    out.push(...entry);
    if (prev) dict.push([...prev, entry[0]]);
    prev = entry;
    if (dict.length === 1 << codeSize && codeSize < 12) codeSize += 1;
  }
  return out;
}

/** Walks the GIF blocks and returns the frames' index data. */
function parseGif(bytes: Uint8Array) {
  let p = 13;
  const packed = bytes[10];
  const tableSize = 1 << ((packed & 7) + 1);
  p += tableSize * 3;
  const frames: { delay: number; transparent: number; indices: number[]; disposal: number }[] = [];
  let loop: number | null = null;
  let gce = { delay: 0, transparent: -1, disposal: 0 };
  for (;;) {
    const block = bytes[p];
    if (block === 0x3b) break;
    if (block === 0x21) {
      const label = bytes[p + 1];
      if (label === 0xf9) {
        gce = { disposal: (bytes[p + 3] >> 2) & 7, delay: u16(bytes, p + 4), transparent: bytes[p + 3] & 1 ? bytes[p + 6] : -1 };
        p += 8;
      } else if (label === 0xff) {
        if (ascii(bytes, p + 3, 11) === 'NETSCAPE2.0') loop = u16(bytes, p + 16);
        p += 2;
        while (bytes[p] !== 0) p += bytes[p] + 1;
        p += 1;
      } else throw new Error('unknown extension');
    } else if (block === 0x2c) {
      const width = u16(bytes, p + 5);
      const height = u16(bytes, p + 7);
      p += 10;
      const minCode = bytes[p];
      p += 1;
      const chunks: number[] = [];
      while (bytes[p] !== 0) {
        chunks.push(...bytes.slice(p + 1, p + 1 + bytes[p]));
        p += bytes[p] + 1;
      }
      p += 1;
      frames.push({ ...gce, indices: lzwDecode(Uint8Array.from(chunks), minCode, width * height) });
    } else throw new Error(`unexpected byte ${block} at ${p}`);
  }
  return { frames, loop, tableSize, end: p };
}

describe('GIF encoder', () => {
  const sprite = createExampleSprite();
  const bytes = encodeGif({ width: 16, height: 16, frames: sprite.frames, delayCs: 12, scale: 2 });

  it('writes a GIF89a header with the scaled size and a global colour table', () => {
    expect(ascii(bytes, 0, 6)).toBe('GIF89a');
    expect(u16(bytes, 6)).toBe(32);
    expect(u16(bytes, 8)).toBe(32);
    expect(bytes[10] & 0x80).toBe(0x80);
    expect(bytes[bytes.length - 1]).toBe(0x3b);
  });

  it('loops forever, keeps the delay and marks index 0 transparent with disposal to background', () => {
    const gif = parseGif(bytes);
    expect(gif.loop).toBe(0);
    expect(gif.frames).toHaveLength(8);
    expect(gif.end).toBe(bytes.length - 1);
    for (const frame of gif.frames) {
      expect(frame.delay).toBe(12);
      expect(frame.transparent).toBe(0);
      expect(frame.disposal).toBe(2);
    }
  });

  it('round-trips the pixels through LZW', () => {
    const gif = parseGif(bytes);
    const table = buildColorTable(sprite.frames);
    sprite.frames.forEach((frame, f) => {
      const decoded = gif.frames[f].indices;
      expect(decoded).toHaveLength(32 * 32);
      for (let y = 0; y < 32; y += 1) {
        for (let x = 0; x < 32; x += 1) {
          expect(decoded[y * 32 + x]).toBe(table.indexOf(frame[(y >> 1) * 16 + (x >> 1)]));
        }
      }
    });
  });

  it('survives dictionary resets on noisy images', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    const indices = Array.from({ length: 128 * 128 }, () => random() % 200);
    const data = lzwEncode(indices, 8);
    expect(lzwDecode(data, 8, indices.length)).toEqual(indices);
    const smooth = Array.from({ length: 5000 }, (_, i) => Math.floor(i / 300) % 4);
    expect(lzwDecode(lzwEncode(smooth, 2), 2, smooth.length)).toEqual(smooth);
  });

  it('writes a still image without a loop block and handles a fully transparent frame', () => {
    const still = encodeGif({ width: 8, height: 8, frames: [createFrame(8, 8)], delayCs: 10 });
    const gif = parseGif(still);
    expect(gif.loop).toBeNull();
    expect(gif.tableSize).toBe(2);
    expect(gif.frames[0].indices).toEqual(new Array(64).fill(0));
  });

  it('maps more than 255 colours to the nearest kept colour', () => {
    const frame = createFrame(20, 20);
    for (let i = 0; i < 400; i += 1) frame[i] = i * 97;
    frame[0] = TRANSPARENT;
    const table = buildColorTable([frame]);
    expect(table.colors.length).toBe(256);
    expect(table.indexOf(frame[399])).toBeGreaterThan(0);
  });
});
