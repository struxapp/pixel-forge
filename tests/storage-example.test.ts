import { describe, expect, it } from 'vitest';
import { EXAMPLE_SHAPES, createExampleSprite } from '../src/example';
import { TRANSPARENT } from '../src/model';
import { decodeFrame, deserializeProject, encodeFrame, serializeProject } from '../src/storage';

describe('example sprite', () => {
  it('has 16-pixel rows in every shape', () => {
    for (const shape of Object.values(EXAMPLE_SHAPES)) for (const row of shape) expect(row).toHaveLength(16);
  });

  it('is 16 × 16 with 8 frames that all contain pixels', () => {
    const sprite = createExampleSprite();
    expect(sprite.width).toBe(16);
    expect(sprite.frames).toHaveLength(8);
    for (const frame of sprite.frames) expect(frame.some((c) => c !== TRANSPARENT)).toBe(true);
  });
});

describe('project storage', () => {
  it('run-length encodes frames and decodes them back', () => {
    const sprite = createExampleSprite();
    for (const frame of sprite.frames) {
      const text = encodeFrame(frame);
      expect(decodeFrame(text, 256)).toEqual(frame);
    }
    expect(encodeFrame(new Int32Array([TRANSPARENT, TRANSPARENT, 0xff0000]))).toBe('2*-,ff0000');
  });

  it('round-trips a whole project', () => {
    const sprite = createExampleSprite();
    const text = serializeProject({ sprite, fps: 10, isExample: true, customPalette: ['#123456'], paletteId: 'dusk8' });
    const back = deserializeProject(text);
    expect(back?.sprite.frames).toEqual(sprite.frames);
    expect(back).toMatchObject({ fps: 10, isExample: true, customPalette: ['#123456'], paletteId: 'dusk8' });
  });

  it('rejects damaged data', () => {
    expect(deserializeProject('not json')).toBeNull();
    expect(deserializeProject('{"v":1,"w":4,"h":4,"frames":["16*-"]}')).toBeNull();
    expect(deserializeProject('{"v":1,"w":8,"h":8,"frames":["63*-"]}')).toBeNull();
    expect(decodeFrame('2*zzzzzz', 2)).toBeNull();
  });
});
