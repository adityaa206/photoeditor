# PhotoEditor

A layer-based photo editor for compositing: put one photo on top of another, mask it,
match the perspective, remove backgrounds, blend and stitch. Runs as a Windows desktop app
or straight from `index.html` in a browser. Nothing is uploaded anywhere; files stay on your computer.

## Run it

- **Desktop app:** `dist/PhotoEditor-win32-x64/PhotoEditor.exe` (the desktop shortcut **PhotoEditor** points there).
  Works fully offline; the AI model and all decoders are bundled.
- **Browser:** double-click `Start PhotoEditor.cmd` or open `index.html` in Chrome / Edge / Firefox.
  TIFF/HEIC/PSD decoders and the AI model download on first use (internet needed once).

## Build the desktop app yourself

```bash
npm install
npm run fetch-vendor   # ONNX Runtime, segmentation model (44 MB), format decoders
npm run pack           # -> dist/PhotoEditor-win32-x64/PhotoEditor.exe
```

`npm start` runs the app from source with Electron. `python dev-server.py` serves the browser
version with no-cache headers for development.

## Replace part of a photo (for example an eye)

1. **File ▸ Open** (Ctrl+O) the base photo, or drag it onto the window.
2. **File ▸ Place** (Ctrl+Shift+O) the second photo; it becomes a layer on top.
3. **Ctrl+T** (Free Transform): drag inside to move, corners to scale, outside to rotate.
   Arrow keys nudge. Lower the layer opacity or use *Difference blend* (Stitch panel) to line it up. **Enter** applies.
4. **Ctrl+Shift+T** (Perspective / Distort) when the second photo was shot from another angle:
   drag the corners so its edges follow the base photo's perspective (the grid helps). Perspective mode
   moves the opposite corner symmetrically; Distort mode moves corners freely; edge dots skew. **Enter** applies.
5. Elliptical Marquee (**Shift+M**) with a Feather value, drag around the eye, then click **◐** in the Layers panel.
   A layer mask hides everything outside the ellipse; nothing is deleted.
6. Refine the mask with the Brush (**B**): black hides, white reveals. Press **\\** to see hidden areas in red.
7. *Match color to layer below* (Stitch panel) or the Adjust menu to match tones; Clone Stamp (**S**) for seams.
8. **File ▸ Save Project** keeps everything editable (`.pep`); **File ▸ Export** writes PNG, JPEG, WebP, BMP, TIFF or a layered PSD.

## Remove a background

Everything in the **Background Remover** panel works on the layer mask, so it is non-destructive.

- **Remove background (AI)** finds the main subject automatically (U²-Net model, runs locally).
  *Edge soft*, *Shrink/grow* and *Threshold* tune the cut-out; *Re-apply edge settings* recomputes without rerunning the model.
- **Click a background color…** removes a plain background by color (tolerance, contiguous or everywhere).
- **Background Eraser** brush (**Shift+E**) samples the color under the cursor and hides similar colors inside the brush,
  like Photoshop's Background Eraser; *Erase* hides everything under the brush, *Restore* brings pixels back.
  Alt+click picks a fixed color to erase.

## Stitch two photos

Open the first photo, Place the second, then in **Stitch & Composite** choose direction, overlap and blend width and click
**Arrange & blend visible layers**. *Auto-align to layer below* finds the best shift; *Difference blend* turns aligned areas black.

## File formats

| Direction | Formats |
|-----------|---------|
| Open / Place | PNG, JPEG, GIF, WebP, BMP, ICO, SVG, AVIF, JXL (whatever the browser decodes), TIFF, DNG and TIFF-based camera RAW (CR2, NEF, ARW … best effort), HEIC/HEIF, Photoshop PSD/PSB with layers and masks, `.pep` projects. Files with a wrong or unknown extension are tried with every decoder. |
| Export | PNG, JPEG (quality), WebP, BMP, TIFF, layered PSD, `.pep` project |

Images larger than 8192 px per side (or 48 megapixels) are reduced on import. JPEG and BMP have no transparency,
so they are flattened onto the chosen background color.

## Tools

Move (V), Free Transform (Ctrl+T), Perspective / Distort (Ctrl+Shift+T), Rectangular / Elliptical Marquee (M / Shift+M),
Lasso (L), Polygonal Lasso (Shift+L), Magic Wand (W), Crop (C), Eyedropper (I), Brush (B), Eraser (E),
Background Eraser (Shift+E), Clone Stamp (S), Gradient (G), Paint Bucket (Shift+G), Text (T), Shapes (U),
Hand (H / hold Space), Zoom (Z / mouse wheel). The status bar explains the active tool.

Layers: opacity, 16 blend modes, visibility, locking, drag-and-drop ordering, masks, merge, flatten, duplicate,
flip, rotate, fit / fill / center, rasterize. Adjustments: Brightness/Contrast, Levels, Exposure, Hue/Saturation,
Temperature/Tint, Vibrance, Auto Contrast, Invert, Desaturate, Sepia, Threshold, Posterize. Filters: Gaussian Blur,
Unsharp Mask, Add Noise, Pixelate. All are undoable (History panel) and respect the selection.
**Help ▸ Keyboard Shortcuts** lists every key.

## Project layout

- `index.html`, `css/`, `js/` — the application (plain HTML/JS, no build step)
- `electron/` — desktop shell (local private server + native save dialogs)
- `scripts/fetch-vendor.mjs`, `scripts/pack.mjs` — download runtime assets, build the exe
- `vendor/` — downloaded runtime assets (not committed), `build/` — app icon

Third-party runtime components: ONNX Runtime Web (MIT), U²-Net silueta model (Apache-2.0, rembg project),
UTIF (MIT), heic2any (MIT), ag-psd (MIT), Electron (MIT).
