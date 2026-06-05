<div align="center">

<img src="./public/icons/icon-192.png" width="88" height="88" alt="Slate logo" />

# Slate

**A lightning-fast, local-first infinite whiteboard.**
No login. No signup. No cloud. Works offline. Open → draw → share in under a second.

### ▶ [**Try it live**](https://slatewhiteboard.vercel.app)

[![Next.js](https://img.shields.io/badge/Next.js-14-000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![PWA](https://img.shields.io/badge/PWA-offline-5B6CFF)](#-local-first--offline)
[![License: MIT](https://img.shields.io/badge/License-MIT-111)](#license)

[**Live demo**](https://slatewhiteboard.vercel.app) · [**Spec**](./SPEC.md) · [**Features**](#-features) · [**Shortcuts**](#-keyboard-shortcuts)

</div>

---

## ✨ Live demo

**→ [slatewhiteboard.vercel.app](https://slatewhiteboard.vercel.app)**

> Everything runs in your browser. Your boards never leave your device — they live in IndexedDB, not on a server.

---

## Why Slate

Most whiteboards make you sign in, wait for a workspace to load, and trust a server with your ideas. Slate flips that: it opens instantly to a blank canvas, saves automatically on your device, and works with the network unplugged. It’s designed to feel **faster and calmer than the tools you already know** — keyboard-first, distraction-free, and polished down to the pixel.

- ⚡ **Instant** — no auth, no spinner; the canvas is there before you finish your thought.
- 🔒 **Private by default** — boards, images, and settings stay in IndexedDB on your machine.
- ✈️ **Offline-first** — installable PWA; draw on a plane, sync nothing.
- 🎨 **Pro-grade** — frames, presentation mode, smart connectors, gradients, layers, and more.

---

## 🧰 Features

### Canvas & tools
- **Infinite, zoomable, pannable canvas** — mouse, trackpad, pinch-zoom, two-finger pan, `Space`-drag.
- Render-on-demand Canvas2D engine with viewport culling — smooth with thousands of objects.
- **Pen** (pressure-style freehand), **shapes** (rectangle, ellipse, diamond, triangle), **line**, **arrow**, **text**, **sticky notes**, **images** (drag-drop / paste / resize / rotate), **eraser**.
- Multi-select, move, rotation-aware resize, rotate, group / ungroup, lock, hide, reorder, duplicate.
- **Auto shape detection** — rough pen sketches snap to clean shapes.
- **Snapping & smart guides** — to object edges, centers, and the grid.

### Pro tools — for designers & directors
| | |
|---|---|
| 🖼️ **Frames / artboards** | Titled, fixed-aspect canvases (16:9, 9:16, 1:1, 4:3, A4) that **clip their contents**. Drag a frame to move everything inside. Export one frame or all of them. |
| ▶️ **Presentation mode** | Turn frames into slides and present full-screen with **animated camera moves**, keyboard/click navigation, a slide counter, and a **laser pointer**. |
| 🔗 **Smart connectors** | Arrows and lines **bind to shapes and reroute** automatically when you move, resize, or rotate them. |
| 📐 **Align · distribute · flip** | A floating bar appears on multi-select: align six ways, distribute evenly, flip H/V. |
| 🌙 **Dark mode + canvas themes** | Light / dark / system, with dots, grid, lines, or plain backgrounds. |
| 🎨 **Gradients · shadows · eyedropper** | Linear gradient fills with angle, drop-shadow presets, and a screen color picker. |
| 🔠 **Rich typography** | Weight, italic, line height, letter spacing, and bulleted / numbered lists. |
| 🗂️ **Layers panel** | Rename, drag-reorder, show/hide, and lock every object. |
| 🖌️ **Image studio** | Per-image brightness / contrast / saturation / blur / grayscale + one-click palette extraction. |
| 🗺️ **Minimap** | Overview navigator with a draggable viewport. |

### Local-first & offline
- **IndexedDB** persistence for boards, image assets, and preferences.
- **Autosave** every ~0.7s — no save button, nothing to lose.
- Installable **PWA** (service worker + manifest + generated icons); fully usable offline.

### Boards & sharing
- Home dashboard with **templates**, recents, favorites, archive, and search (by title **and** text content).
- Built-in templates: Flowchart, Mind Map, Kanban, User Journey, Product Roadmap.
- Export to **PNG, JPG, SVG, PDF, HTML snapshot**, and a re-importable **`.board`** file (with embedded images).
- **Command palette** (`⌘K`) for fast actions and jumping between boards.

---

## 🚀 Quickstart

```bash
git clone https://github.com/Dragoon0x/slate-whiteboard.git
cd slate-whiteboard
npm install

npm run dev          # dev server → http://localhost:3000
```

Build the static, offline-ready bundle:

```bash
npm run build        # static export → ./out
npm start            # serve ./out → http://localhost:4321
```

There is **no backend, database, or environment configuration**. `out/` is a self-contained static site you can host anywhere.

---

## ⌨️ Keyboard shortcuts

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| `V` | Select | `⌘Z` | Undo |
| `P` | Pen | `⌘⇧Z` / `⌘Y` | Redo |
| `R` | Rectangle | `⌘D` | Duplicate |
| `C` | Ellipse | `⌘A` | Select all |
| `D` | Diamond | `⌘C/X/V` | Copy / cut / paste |
| `G` | Triangle | `⌘G` / `⌘⇧G` | Group / ungroup |
| `A` | Arrow | `⌘ +/-/0` | Zoom in / out / reset |
| `L` | Line | `⌘[ ` / `⌘]` | Send back / bring forward |
| `T` | Text | `F` | Frame |
| `N` | Sticky note | `E` | Eraser |
| `⌘K` | Command palette | `Space` (hold) | Pan |
| `⇧1` | Fit to content | `⌫` | Delete |

Double-click anywhere to add text. In presentation mode: `←` / `→` / `Space` to navigate, `L` for laser, `Esc` to exit.

---

## 🏗️ Architecture

A single source of truth (a Zustand store holding an **immutable `Element[]` scene**) drives a custom Canvas2D renderer. The canvas subscribes to the store imperatively and redraws on one `requestAnimationFrame` — React only re-renders chrome, never on pointer move, which keeps interactions at 60 FPS.

```
app/        Routes: home dashboard + /board editor (static export)
lib/        Data model, store, geometry, IndexedDB, export, frames,
            connectors, arrange, theme, palette, templates
components/  Canvas engine (render / interaction / transform / handles),
            plus all UI: toolbar, panels, command palette, present, modals
```

See **[SPEC.md](./SPEC.md)** for the full product + technical specification (data model, feature specs, performance, browser support, roadmap).

---

## 🔐 Data & privacy

Everything stays on your device in IndexedDB (`slate-whiteboard`): boards (with thumbnails), image blobs, and settings. Nothing is uploaded. To back up or move work between devices, export a `.board` file and import it elsewhere.

---

## 🧱 Tech stack

Next.js 14 (static export) · React 18 · TypeScript · Tailwind CSS · Zustand · Framer Motion · `perfect-freehand` · a custom Canvas2D engine · IndexedDB · PWA.

---

## License

MIT — do anything you like.
