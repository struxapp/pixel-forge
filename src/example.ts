import { TRANSPARENT, createFrame, type Sprite } from './model';

/** The example loaded on first visit: a little slime that bounces and blinks (8 frames, 16 × 16). */

const KEY: Record<string, number> = {
  '.': TRANSPARENT,
  o: 0x14121d, // outline
  g: 0x57d18b, // body
  d: 0x2e9d6a, // body shade
  h: 0xd4fbe1, // highlight
  e: 0x14121d, // eye
  w: 0xf4f1ea, // eye shine
  p: 0xff8fa8, // blush
};
const SHADOW = 0x3b3656;

const NORMAL = [
  '......oooo......',
  '....oohhggoo....',
  '...ohhggggggo...',
  '..ohgggggggggo..',
  '..oggweggweggo..',
  '.ogggeeggeegggo.',
  '.ogppggooggppgo.',
  '.oddggggggggddo.',
  '..oooooooooooo..',
];

const BLINK = [
  '......oooo......',
  '....oohhggoo....',
  '...ohhggggggo...',
  '..ohgggggggggo..',
  '..oggggggggggo..',
  '.ogggooggoogggo.',
  '.ogppggooggppgo.',
  '.oddggggggggddo.',
  '..oooooooooooo..',
];

const SQUASH = [
  '.....oooooo.....',
  '...oohhggggoo...',
  '..ohhggggggggo..',
  '.ogggweggwegggo.',
  'ogppgeeggeegppgo',
  'oddggggooggggddo',
  '.oooooooooooooo.',
];

const STRETCH = [
  '.......oo.......',
  '.....oohgoo.....',
  '....ohhggggo....',
  '....ohgggggo....',
  '...ogweggwego...',
  '...ogeeggeego...',
  '...opggooggpo...',
  '...oggggggggo...',
  '...oddggggddo...',
  '....oooooooo....',
];

export const EXAMPLE_SHAPES = { NORMAL, BLINK, SQUASH, STRETCH };

/** Shape, how far it is lifted, and the half-width of the shadow under it. */
const SEQUENCE: [string[], number, number][] = [
  [NORMAL, 0, 5],
  [SQUASH, 0, 6],
  [STRETCH, 3, 4],
  [NORMAL, 5, 3],
  [STRETCH, 3, 4],
  [SQUASH, 0, 6],
  [NORMAL, 0, 5],
  [BLINK, 0, 5],
];

export const EXAMPLE_SIZE = 16;
export const EXAMPLE_FPS = 8;
export const EXAMPLE_NAME = 'Bouncing slime';

export function createExampleSprite(): Sprite {
  const size = EXAMPLE_SIZE;
  const frames = SEQUENCE.map(([shape, lift, shadowHalf]) => {
    const frame = createFrame(size, size);
    // Ground shadow on the bottom row.
    for (let x = 8 - shadowHalf; x < 8 + shadowHalf; x += 1) frame[15 * size + x] = SHADOW;
    const bottom = 14 - lift;
    const top = bottom - shape.length + 1;
    shape.forEach((row, r) => {
      for (let x = 0; x < size; x += 1) {
        const color = KEY[row[x]] ?? TRANSPARENT;
        if (color !== TRANSPARENT) frame[(top + r) * size + x] = color;
      }
    });
    return frame;
  });
  return { width: size, height: size, frames };
}
