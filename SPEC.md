# Slate — Product & Technical Specification

> A lightning-fast, local-first infinite whiteboard. This document describes what Slate is, how it behaves, and how it is built.

---

## 1. Overview

Slate is a browser-based infinite whiteboard that runs entirely on the client. There is no account system, no backend, and no network dependency for any core feature. A user opens the app, lands on a blank canvas (or their dashboard), draws, and their work is saved automatically to the device. Boards can be exported as images, vectors, PDFs, a self-contained HTML snapshot, or a re-importable `.board` file.

The product target is **creative work that benefits from speed and focus** — sketching, diagramming, moodboarding, wireframing, planning, and presenting — for individual designers, directors, and makers.

---

## 2. Goals & non-goals

**Goals**
- Open to an interactive canvas in **under one second**; zero friction (no login/onboarding).
- **Local-first**: all data on device; full functionality offline.
- **60 FPS** interaction with thousands of objects.
- A **complete, polished** drawing toolset plus pro features (frames, presentation, connectors, layers, themes).
- **Portable** output: standard export formats + a self-contained board file.

**Non-goals (this version)**
- Authentication, accounts, or server-side storage.
- Real-time multiplayer (the architecture is collaboration-ready; see §17).
- Mobile-native apps (the PWA is installable and responsive instead).

---

## 3. Personas

- **The Designer** — composes layouts on fixed-size frames, cares about gradients, typography, alignment, and pulling palettes from reference images.
- **The Director** — assembles frames into a narrative and presents full-screen; reviews and annotates.
- **The Maker / PM** — diagrams systems and flows with connected shapes; runs quick planning boards from templates.

---

## 4. Product principles

1. **Speed is a feature** — no spinners on open; interaction never blocks on I/O.
2. **Calm, minimal chrome** — UI occupies the edges; the canvas is the product. Monochrome surface with a single blue accent (`#5B6CFF`).
3. **Keyboard-first** — every primary action has a shortcut; a command palette covers the rest.
4. **Your data is yours** — nothing leaves the device unless the user exports it.
5. **Nothing is lost** — continuous autosave + full undo/redo.

---

## 5. Information architecture

Two routes, both statically exported and client-rendered:

| Route | Purpose |
|---|---|
| `/` | Dashboard: templates, recent/favorite/archived boards, search, create/import. |
| `/board?id=<id>` | The editor for a single board. Reads the id from the query string. |

Theme and canvas-background preferences are applied app-wide before first paint to avoid flashes.

---

## 6. Data model

All board content is a flat, immutable array of `Element` objects. Every field beyond the core geometry is optional, so older boards deserialize unchanged as features are added.

```ts
type ElementType =
  | 'rectangle' | 'ellipse' | 'diamond' | 'triangle'
  | 'line' | 'arrow' | 'draw' | 'text' | 'sticky' | 'image' | 'frame';

interface Element {
  id: string;
  type: ElementType;
  x: number; y: number; width: number; height: number;  // AABB in world units
  angle: number;                                         // radians, about the center
  strokeColor: string; backgroundColor: string;
  fillStyle: 'solid' | 'transparent';
  strokeWidth: number; strokeStyle: 'solid' | 'dashed' | 'dotted';
  opacity: number;     // 0..100
  roundness: number;   // 0..1 corner factor

  points?: { x: number; y: number }[];   // draw/line/arrow, relative to x,y

  // text (text / sticky / frame label)
  text?: string; fontSize?: number; fontFamily?: 'sans'|'serif'|'mono';
  textAlign?: 'left'|'center'|'right'; fontWeight?: 400|500|600|700;
  italic?: boolean; lineHeight?: number; letterSpacing?: number;
  list?: 'none'|'bullet'|'number';

  fileId?: string;                       // image asset reference
  filters?: { brightness; contrast; saturate; blur; grayscale; sepia };

  gradient?: { stops: { color: string; at: number }[]; angle: number };
  shadow?: { x: number; y: number; blur: number; color: string };
  flipX?: boolean; flipY?: boolean;

  startBinding?: { elementId: string; gap: number; focus: number } | null;  // connectors
  endBinding?:   { elementId: string; gap: number; focus: number } | null;

  frameId?: string | null;  // containing frame
  name?: string;            // layers/frame label
  frameOrder?: number;      // slide order

  groupId?: string | null; locked?: boolean; hidden?: boolean;
  seed: number; updated: number;
}
```

**Board & assets** (IndexedDB stores `boards`, `assets`, `settings`):

```ts
interface BoardRecord {
  id; name; createdAt; updatedAt; favorite; archived; thumbnail?;
  elements: Element[]; camera: { x; y; zoom };
}
interface AssetRecord { id; blob: Blob; type; width; height; createdAt; }
```

**Coordinates.** `(camera.x, camera.y)` is the world point shown at the viewport's top-left; `zoom` scales world→screen. All elements live in world space; selection handles, guides, and frame labels are drawn in screen space so they stay constant size.

---

## 7. Feature specifications

### 7.1 Canvas & navigation
Infinite pan/zoom (`0.05×`–`30×`). Wheel pans; ⌘/Ctrl-wheel and pinch zoom to the cursor; `Space`-drag or middle-button pans. Viewport culling skips off-screen elements; rendering is coalesced to one `requestAnimationFrame`.

### 7.2 Tools
Pen (smoothed variable-width freehand), rectangle/ellipse/diamond/triangle, line, arrow (with arrowhead), text (multi-line, auto-grow), sticky note (5 colors), image (drag-drop / clipboard paste, stored as a blob asset), eraser. Click-to-place gives sensible default sizes; drag sets exact bounds (Shift constrains to square / 45°).

### 7.3 Selection & transform
Single and marquee multi-select; group/ungroup; lock; hide; z-order (front/back/forward/backward); duplicate; arrow-key nudge (Shift ×10). Single-element resize is rotation-exact (works in the element's local frame); multi-select uses uniform box scaling. Rotation via the top handle (Shift snaps to 15°). The selection box is **suppressed while a creation gesture is in progress** — you only see the live shape, never handles, until you release.

### 7.4 Snapping & smart guides
While moving, the selection's edges and centers snap to nearby elements' edges/centers and to the grid; accent guide lines render at the matched axes.

### 7.5 Auto shape detection
On pen release (when enabled), the stroke is simplified and classified (corner count + closedness) into a clean rectangle, ellipse, diamond, triangle, or straight line, inheriting the stroke's style.

### 7.6 Frames / artboards
A `frame` is a titled, axis-aligned artboard with preset aspects (16:9, 9:16, 1:1, 4:3, A4). **Membership** is geometric: an element whose center lies inside a frame becomes its child (`frameId`), recomputed at gesture end. Children **clip** to the frame's rounded rect at render time; the array is normalized so each frame is immediately followed by its children (array order = visual order). Dragging a frame carries its children. Deleting a frame releases its children. Frames don't rotate. Per-frame and all-frames export crop to the frame bounds.

### 7.7 Smart connectors
Arrows/lines may bind either endpoint to an element. A pure `refreshConnectors` pass recomputes bound endpoints as the ray from one element's center toward the other, intersected with the target's rotation-aware AABB plus a small gap. It runs after every geometry change (move/resize/rotate/nudge/align/flip/duplicate/load) and returns the same array reference when nothing changed (no churn). Deleting a target drops the binding but keeps the connector. Copy/paste and duplicate remap bindings to the copies (or drop them if the target wasn't copied).

### 7.8 Align · distribute · flip
On multi-select: align left/centerX/right/top/centerY/bottom; distribute horizontally/vertically (≥3, equal gaps, ends fixed); flip horizontally/vertically. Align deltas are computed on the AABB and applied to `x/y` (correct under rotation). Flip mirrors closed shapes/images/text/stickies via render-time `flipX/flipY` flags (text is counter-flipped to stay readable) and mirrors point-based strokes directly.

### 7.9 Typography
Per-text weight, italic, line height, letter spacing, and bullet/numbered lists (with hanging indents on wrapped lines). Mirrored in the live editing overlay and in SVG export.

### 7.10 Advanced fill
Linear gradient fills (2+ stops, angle) projected across the element's local box; drop-shadow presets applied to the fill only (never bleeding onto stroke/text). A screen-color **eyedropper** is offered where the platform supports it.

### 7.11 Image studio
Per-image CSS-style filters (brightness, contrast, saturation, blur, grayscale, sepia) applied at draw time and in export. **Palette extraction** downscales the image and runs median-cut quantization to produce ~6 swatches that can be applied as the active draw color.

### 7.12 Layers panel
Top-of-stack-first list with type icons; per-row rename, visibility, lock, select (shift = multi), and drag-to-reorder (maps to z-order). Two-way selection sync with the canvas.

### 7.13 Minimap
Bottom-right overview of all element AABBs plus a draggable viewport rectangle; click/drag recenters the camera. Throttled to one frame; hidden on small screens.

### 7.14 Theming
`light | dark | system`, persisted and applied pre-paint (no flash). Canvas background style: dots, grid, lines, or plain — theme-aware colors. New elements default to a theme-appropriate stroke; existing element colors are never rewritten.

### 7.15 Presentation mode
Frames become ordered slides. A full-screen overlay renders only the current frame and its children on a dark backdrop, with an eased camera tween (linear x/y, log-space zoom) between slides. Navigate with `←`/`→`/`Space`/click; `Esc` exits and restores the editor view; `L` toggles a laser pointer. A slide counter and prev/next controls are shown.

### 7.16 Export & import
- **PNG / JPG** — raster via an offscreen canvas (DPR-scaled).
- **SVG** — vector, including gradients (`<linearGradient>`), shadows (`feDropShadow`), typography attributes, image filters, and clip paths.
- **PDF** — a dependency-free single-page writer embedding a JPEG (DCTDecode).
- **HTML snapshot** — a single self-contained file with inline SVG.
- **`.board`** — JSON with elements, camera, and embedded image assets (data URLs); re-importable, with asset IDs remapped on import.
- Scope selector when frames exist: whole board / this frame / all frames.

### 7.17 Command palette & search
`⌘K` opens a fuzzy, grouped command list (board actions, view, tools, theme, present) and a "switch to board" list. Dashboard search matches board titles **and** element text.

### 7.18 Board management
Create (blank or from template), rename, duplicate, archive, delete (cascading image-asset cleanup), favorite, and search. Thumbnails are generated from the rendered board.

---

## 8. Rendering architecture

A single `renderScene(params)` call:
1. clears + fills the theme background, draws the background pattern (screen space);
2. switches to world space and draws elements (culled), grouping frame children under a clip;
3. switches back to screen space for frame labels, hover, snap guides, bind highlight, selection frame + handles, and the marquee.

`drawElement` applies opacity, a center-rotate-flip transform, then per-type drawing (rounded-rect, ellipse, polygon, polyline + arrowhead, freehand outline via `perfect-freehand`, clipped image, sticky with shadow, text block). The same function powers on-screen rendering **and** raster export, guaranteeing WYSIWYG.

---

## 9. State & history

A Zustand store holds the document (elements, camera, name), interaction (tool, selection, editing, hover), style defaults, preferences, and history. **All element mutations are immutable** (new arrays + new objects), so undo/redo store array references with no deep cloning. Gestures snapshot the pre-gesture array and commit it once on release; history is capped (120 entries). The canvas reads the store imperatively to avoid React re-renders during interaction; only chrome components subscribe via selectors.

---

## 10. Persistence & autosave

A debounced (~700 ms) subscription writes the board record to IndexedDB after any change to elements, camera, or name. Thumbnails are regenerated at most every few seconds. Theme and canvas-background preferences persist in the `settings` store (and a `localStorage` hint for pre-paint theming).

---

## 11. Offline / PWA

A web manifest + generated PNG icons (192 / 512 / maskable) make Slate installable. A service worker precaches the app shell and uses network-first for navigations and stale-while-revalidate for same-origin assets, so the app loads and runs offline. The build is a fully static export — deployable to any static host or CDN.

---

## 12. Performance

- Render-on-demand (single rAF), viewport culling, and immutable-by-reference change detection.
- Freehand outlines and image bitmaps are cached.
- No per-pointer-move React renders.
- Targets 60 FPS interaction with thousands of objects.

---

## 13. Accessibility & input

Mouse, trackpad, pen, and touch (pinch-zoom, two-finger pan) are supported via Pointer Events. Controls have titles/labels; the command palette and shortcuts provide keyboard access to primary actions. The mobile layout uses a scrollable bottom toolbar and a compact top bar.

---

## 14. Browser support

Modern evergreen browsers (Chromium, Firefox, Safari). Progressive enhancements degrade gracefully: the eyedropper appears only where the platform API exists; `ctx.letterSpacing` falls back to manual spacing where unsupported.

---

## 15. Security & privacy

No data is transmitted; there is no server. All content lives in the browser's IndexedDB on the user's device. Exported files are generated locally. Clearing site data removes all boards (so users are encouraged to export `.board` backups).

---

## 16. Build & deploy

- `npm run dev` — local dev server.
- `npm run build` — static export to `out/` (a `prebuild` hook generates PWA icons).
- `npm start` — serve `out/` with a tiny dependency-free static server.
- Deploys to any static host or CDN; on Vercel it builds and serves the static export directly.

---

## 17. Roadmap (collaboration-ready)

The data layer is intentionally a flat array of plain, id-keyed objects with immutable updates routed through the store — a clean seam for a future realtime layer (e.g. CRDT + WebRTC) to sync the `elements` array and broadcast presence/cursors **without** introducing authentication. Other natural extensions: orthogonal connector routing, frame-aware layer grouping, richer text blocks, and component/asset libraries.
