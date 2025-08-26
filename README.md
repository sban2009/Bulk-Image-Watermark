# Bulk Image Watermark Tool

## Overview

A small static web app that applies text or image watermarks to uploaded images. Supports click-to-open file chooser and drag-and-drop uploads. Watermarks can be placed singly (corners/center) or in a combined tiled pattern. Downloads are available as individual images or a ZIP.

## Project files (important)

- `index.html` — UI markup and DOM elements
- `style.css` — Visual styles and theme tokens
- `app.js` — Main application logic (uploader, watermark rendering, modal)

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

## Changelog

- 2025-08-27 — Modal positioning and CSS structure fixes.

  - Fixed modal appearing "below the page" instead of as a proper popup overlay.
  - Corrected broken CSS nesting that was causing modal styles to not apply properly.
  - Improved modal positioning with explicit viewport coverage (`100vw`, `100vh`) and robust z-index layering.
  - Enhanced modal overlay positioning from `absolute` to `fixed` for better viewport coverage.
  - Added proper `pointer-events` handling for modal states (none when hidden, auto when shown).
  - Restored working modal structure to match the backup implementation.

- 2025-08-26 — Initial documentation added.

  - Respect `prefers-color-scheme` with dark fallback.
  - `patternSpacing` slider now acts additively to computed spacing.
  - Tightened corner `positionMap` and reduced padding to bring watermarks closer to edges.
  - Added drag-and-drop robustness and click fallback logic.

- 2025-08-25 — Defaults and modal selection

  - `patternSpacingX` and `patternSpacingY` now default to 0. A value of 0 means "use the computed minimum spacing to avoid overlap"; increase the sliders to add extra spacing.
  - The gallery modal now includes per-image checkboxes and a "Select All" toolbar; downloads can be done for selected images only.
