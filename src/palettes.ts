/** Palettes made for Pixel Forge. "My palette" is the one you build yourself. */
export interface Palette {
  id: string;
  name: string;
  colors: string[];
}

export const PRESETS: Palette[] = [
  {
    id: 'forge16',
    name: 'Forge 16',
    colors: [
      '#14121d',
      '#3b3656',
      '#6d6a8a',
      '#b9b6cf',
      '#f4f1ea',
      '#7a2f3f',
      '#d9465b',
      '#ff8fa8',
      '#f2994a',
      '#ffd166',
      '#8a5a3c',
      '#2e9d6a',
      '#57d18b',
      '#d4fbe1',
      '#2d5fb8',
      '#4cb7e8',
    ],
  },
  {
    id: 'dusk8',
    name: 'Dusk 8',
    colors: ['#1d1b2e', '#46325d', '#8a4f7d', '#d97b8f', '#f3b391', '#fde3c3', '#5b8fb9', '#a8d5e2'],
  },
  {
    id: 'moss4',
    name: 'Moss 4',
    colors: ['#0f2a1d', '#3e6b3a', '#8bac4f', '#d4e6a5'],
  },
  {
    id: 'ember6',
    name: 'Ember 6',
    colors: ['#1a0f14', '#5c1f24', '#a8352a', '#e8743b', '#f7c35f', '#fff4d6'],
  },
  {
    id: 'greys6',
    name: 'Greys 6',
    colors: ['#000000', '#333333', '#666666', '#999999', '#cccccc', '#ffffff'],
  },
];

export const CUSTOM_ID = 'custom';
export const CUSTOM_DEFAULT = ['#14121d', '#f4f1ea', '#ff8fa8', '#57d18b', '#4cb7e8'];
export const CUSTOM_LIMIT = 64;
