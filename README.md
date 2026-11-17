# Pixel Forge

Pixel Forge is a small pixel art and sprite animation editor that runs entirely in the browser.

- **Canvas** from 8 × 8 to 64 × 64 pixels (New: start blank, or resize and keep the drawing centred).
- **Tools**: pencil, eraser, flood fill, line, rectangle (hold Shift for a filled one) and colour picker.
  Right click erases with any tool.
- **Mirror mode** draws both halves at once; **onion skin** shows the previous and next frames; pixel grid toggle.
- **Palettes**: Forge 16, Dusk 8, Moss 4, Ember 6 and Greys 6 (all made for this app), plus **My palette**, which you
  build yourself from any colour (native colour picker or hex). Delete removes a focused colour from My palette.
- **Frames**: add, duplicate, delete and reorder; an animated preview plays at 1–24 frames per second.
- **Undo and redo** (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z).
- **Export** the current frame as PNG, all frames as a sprite sheet PNG (up to 8 per row) or an animated GIF, at 1× to
  16× scale. The GIF encoder is written for this app (`src/gif.ts`).
- **Saved automatically** in this browser (localStorage). If storage is blocked the editor still works and says so.
- The first visit opens an example animation (a bouncing slime, 8 frames, clearly labelled). "Clear example" or New
  removes it; Undo brings it back.
- Keyboard: B pencil, E eraser, G fill, L line, R rectangle, I picker, M mirror, O onion skin, H grid, P play/pause,
  `,` and `.` previous/next frame. On the focused canvas, arrow keys move a cursor and Space or Enter uses the tool
  (line and rectangle take two presses; Escape cancels).

Layers are not included: the editor keeps one layer per frame.

## Run it

```sh
npm ci
npm run dev      # local development server
npm test         # unit tests (Vitest)
npm run build    # type-check and build to dist/
npm run preview  # serve dist/
```

Node 22 or newer.

## Code map

- `src/tools.ts`: flood fill (4-connected, iterative), Bresenham lines, rectangles, mirroring.
- `src/gif.ts`: GIF89a encoder with a global colour table, LZW compression, transparency and a NETSCAPE2.0 loop.
- `src/spritesheet.ts`: sprite sheet layout.
- `src/storage.ts`: run-length encoded project format for localStorage.
- `src/example.ts`: the example animation, drawn as character grids.
- `tests/`: flood fill, lines, resize, sprite sheet layout, the GIF header and blocks, an independent LZW decoder that
  checks every pixel round-trips, storage and the example data.

## Sources and licences

- GIF format: CompuServe "Graphics Interchange Format Version 89a" specification (1990).
- Fonts: Silkscreen and Space Grotesk, bundled through `@fontsource` packages, SIL Open Font License 1.1.
- Icons: shapes adapted from Lucide (ISC licence).
- Palettes and the example sprite were made for this app.

## Licence

MIT, see [LICENSE](LICENSE).
