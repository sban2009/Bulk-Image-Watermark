# Enhanced Watermark — Documentation

## Overview

A small static web app that applies text or image watermarks to uploaded images. Supports click-to-open file chooser and drag-and-drop uploads. Watermarks can be placed singly (corners/center) or in a combined tiled pattern (grid-like or diagonal-leaning orientation). Downloads are available as individual images or a ZIP.

This README documents the current implementation, UI controls, algorithm decisions (notably spacing and corner alignment), theming behavior, and a changelog you should update whenever the code changes.

## Project files (important)

- `index.html` — UI markup and DOM elements
- `style.css` — Visual styles and theme tokens
- `app.js` — Main application logic (uploader, watermark rendering, modal)
- `README.md` — This document

## Key behaviors implemented

- Uploader

  - Click-to-upload is implemented using a native `<label for="fileInput">` pattern where possible; a programmatic fallback calls `fileInput.click()` when no label exists.
  - Drag-and-drop is supported on the upload area with visual feedback (`.drag-over`). Document-level drop default is prevented to avoid browser navigation.

- Theme

  - The app respects the browser/OS `prefers-color-scheme` setting. If the browser exposes no explicit preference, the UI falls back to dark mode.
  - The theme toggle updates both the `data-color-scheme` attribute on `:root` and the `body.dark-mode` class so existing CSS rules targeting either will work. Consider normalizing CSS to a single mechanism for maintainability.

- Pattern spacing

  - Spacing for the tiled pattern is computed from the watermark's estimated size (text metrics or image dimensions). The UI slider (`patternSpacing`) now acts additively: it increases spacing relative to the computed minimum.
  - Rationale: prevents overlapping by default (computed base), while allowing users to widen spacing via the slider.

- Corner and single positioning

  - `positionMap` values were tightened so corner positions sit closer to image edges.
  - Additional padding/clamping logic prevents clipping while reducing the large gaps previously seen from edges.

## Controls reference (UI -> behavior)

- Watermark type: Text / Image (switches available options)
- Text controls: `textContent`, `fontSize`, `fontFamily`, `textColor`
- Image controls: `watermarkImage` (file input), `imageScale`
- Pattern mode: `single`, `tiled`
- Spacing: `patternSpacing` (slider) — additive: 0 means computed minimum, larger values increase spacing
- Rotation: `watermarkRotation` (applies to single and tiled rotated draws)
- Opacity: `opacity` (0–100)
- Offset X/Y: fine-tune single watermark position from the chosen corner/center

Notes:

-- The `patternAngle` control affects the tiled pattern orientation (0° = grid-like, non-zero = diagonal-leaning).
-- The app logs computed spacing and the number of tiles drawn to the console when rendering tiled patterns to aid debugging.

- `overlayEffect` applies shadow or glow effects to text watermarks.

## Implementation notes (important details for future edits)

- computePatternSpacing(ctx, canvasWidth, canvasHeight)

  - Estimates watermark width/height from text metrics (or image size and `imageScale`) and computes a `base` spacing.
  - The UI `patternSpacing` slider is mapped to an additive value applied on top of the base. This ensures defaults avoid overlap and sliders widen spacing.

- Corner alignment

  - `positionMap` uses 0.06 / 0.94 values for corner coordinates (instead of large 0.15 offsets used earlier).
  - drawTextWatermark and drawImageWatermark use small dynamic paddings (calc from text/image size) and clamp coordinates to keep watermark visible without large empty margins.

- Theme selection

  - The code reads `window.matchMedia('(prefers-color-scheme: dark)')` and `(prefers-color-scheme: light)` to find the user's preference. If none is present, the app defaults to dark.
  - Theme toggling updates both attribute and class to support legacy selectors.

- Uploader

  - The upload area gets click and drag handlers but the click handler is skipped if a native `<label for="fileInput">` exists — this avoids duplicate click behavior.

## How to test quickly

1. Open `index.html` in your browser (double-click or via a local static server).
2. Verify theme: change your OS/browser theme preference and reload. If no preference is set, the UI should load in dark mode.
3. Click the upload area: the file chooser should open. Drag an image onto the upload area: it should highlight and accept the file.
4. Pick the tiled pattern and move the `patternSpacing` slider. You should see spacing increase in the preview; use the `patternAngle` to switch between grid-like and diagonal-leaning orientations.
5. Select corner positions and verify text/image watermarks sit near the edges without clipping.
6. Process images and download the ZIP; open resulting images to confirm watermark placement.

## Automated test harness (manual-run)

We added a small test harness you can open in a browser to exercise the full app flow (upload, preview, and processing) without modifying the app source.

- `tests/app-test.html` — an iframe-based runner that loads `index.html` and provides buttons to:
  - Reload the app iframe
  - Trigger the upload area click programmatically
  - Create a small sample image and send it to `watermarkApp.addFiles()` inside the iframe to exercise preview and processing

  - Quick test controls: set `patternAngle`, `patternSpacingX`, and `patternSpacingY` from the runner UI to verify independent X/Y behavior.
- `tests/run_app_test.js` — helper script referenced by the runner (informational only)

How to run the test harness

1. Open `tests/app-test.html` in your browser (double-click or serve from a local static server).
2. Open DevTools for the iframe (right-click inside the app area & choose "Inspect") to view in-app console logs.
3. Use the runner buttons:
   - "Reload App" to reload the iframe.
   - "Open File Picker" to programmatically click the upload area inside the iframe. Check the iframe console for the upload logs.
   - "Run Full Flow" to create and send a small sample image into the app via `watermarkApp.addFiles()` and observe preview/update logs.

Notes and limitations

- Browser security restrictions on `file://` pages or cross-origin iframe access can restrict script access. If you see errors like "Unable to access iframe window", serve the files via a local server (for example, `npx http-server` or `python -m http.server`) and retry.
- The harness relies on the app exposing `window.watermarkApp` (the main app instance). If the app hasn't initialized fully, reload the iframe and retry the test.

Notes about spacing behaviour

- The tiled pattern now respects `patternSpacingX` (horizontal gap between consecutive items in a row) and `patternSpacingY` (vertical gap between rows). These map to pixel distances on the canvas (scaled from the slider's reference units). For diagonal orientations the system now projects independent dx/dy spacings onto the rotated grid so the two sliders remain independent.

## Troubleshooting tips

- If clicking the upload area does nothing: ensure `input#fileInput` exists in the DOM and is not disabled/hidden behind other elements. The input is intentionally off-screen; the label or programmatic click should trigger it.
- If watermarks overlap at small font sizes: try increasing `patternSpacing` or the `fontSize` control.
- If the theme doesn't change as expected: some browsers or privacy settings may block `prefers-color-scheme`. The fallback is dark.

## Changelog (keep this updated)

- 2025-08-26 — Initial documentation added.

  - Respect `prefers-color-scheme` with dark fallback.
  - `patternSpacing` slider now acts additively to computed spacing.
  - Tightened corner `positionMap` and reduced padding to bring watermarks closer to edges.
  - Added drag-and-drop robustness and click fallback logic.

  - 2025-08-26 — Defaults and modal selection

    - `patternSpacingX` and `patternSpacingY` now default to 0. A value of 0 means "use the computed minimum spacing to avoid overlap"; increase the sliders to add extra spacing.
    - The gallery modal now includes per-image checkboxes and a "Select All" toolbar; downloads can be done for selected images only.

## How to update the changelog

- Add a new date entry with a concise summary of edits any time you modify `app.js`, `index.html`, or `style.css`.

## Contributing / Future improvements

- Normalize CSS theming to a single mechanism (either `data-color-scheme` or `body.dark-mode`).
- Expose the computed spacing value in the UI for advanced users.
- Add unit tests for spacing calculations (node + headless canvas) or a visual regression test harness.

---
