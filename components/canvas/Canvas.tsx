'use client';

import {
  GRID_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  SNAP_THRESHOLD,
  ZOOM_STEP,
} from '@/lib/constants';
import { registerControls } from '@/lib/controls';
import {
  createDraw,
  createImage,
  createLinear,
  createShape,
  createSticky,
  createText,
} from '@/lib/factory';
import {
  boundsFromDrag,
  clamp,
  commonBounds,
  dist,
  elementCenter,
  hitTest,
  intersectsBox,
  normalizePoints,
  screenToWorld,
  worldToScreen,
} from '@/lib/geometry';
import type { Bounds } from '@/lib/geometry';
import { bindableAt, refreshConnectors } from '@/lib/connectors';
import { childrenOf, createFrame, hasFrames } from '@/lib/frames';
import { nanoid } from '@/lib/id';
import { recognizeShape } from '@/lib/recognize';
import { saveAsset } from '@/lib/storage';
import { useEditor } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import type { Element, Point, Tool } from '@/lib/types';
import { useEffect, useRef } from 'react';
import { cacheImage, ensureImages, getCachedImage } from './assets';
import {
  cursorForHandle,
  getSelectionFrame,
  handleAtPoint,
  type HandleType,
} from './handles';
import { renderScene, type SnapGuide } from './render';
import { TextEditor } from './TextEditor';
import {
  computeSnap,
  moveElements,
  resizeElements,
  rotateElements,
} from './transform';

type Mode =
  | 'idle'
  | 'pan'
  | 'pinch'
  | 'create'
  | 'create-linear'
  | 'draw'
  | 'move'
  | 'resize'
  | 'rotate'
  | 'marquee'
  | 'erase';

interface Gesture {
  mode: Mode;
  pointerId: number;
  startScreen: Point;
  startWorld: Point;
  lastScreen: Point;
  newId?: string;
  before: Element[];
  origElements: Element[];
  origBounds: Bounds | null;
  handle?: HandleType;
  startAngle?: number;
  groupCenter?: Point;
  absPoints: Point[];
  moved: boolean;
  beforeSelection: string[];
  additive: boolean;
}

const DRAW_TOOLS: Tool[] = ['rectangle', 'ellipse', 'diamond', 'triangle'];

export function Canvas({ boardId }: { boardId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const rafRef = useRef<number | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const pinchRef = useRef<{ dist: number; mid: Point; cam: { x: number; y: number; zoom: number } } | null>(null);
  const spaceRef = useRef(false);
  const overlayRef = useRef<{ marquee: Bounds | null; snapGuides: SnapGuide[]; bindHighlight: string | null }>({
    marquee: null,
    snapGuides: [],
    bindHighlight: null,
  });
  const framedRef = useRef<string | null>(null);
  const boardIdRef = useRef(boardId);
  boardIdRef.current = boardId;

  // editingId only used to mount the overlay; everything else is imperative
  const editingId = useEditor((s) => s.editingId);
  const tool = useEditor((s) => s.tool);

  // ── render scheduling ──────────────────────────────────────────────────────
  const scheduleRender = () => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height, dpr } = sizeRef.current;
    const s = useEditor.getState();
    ensureImages(s.elements, scheduleRender);
    const selSet = new Set(s.selectedIds);
    const selected = s.elements.filter((e) => selSet.has(e.id));
    // hide the selection box while actively creating/drawing an element
    const g = gestureRef.current;
    const creating = !!g && (g.mode === 'create' || g.mode === 'create-linear' || g.mode === 'draw');
    const frame = s.editingId || creating ? null : getSelectionFrame(selected, s.camera);
    renderScene({
      ctx,
      width,
      height,
      dpr,
      camera: s.camera,
      elements: s.elements,
      getImage: getCachedImage,
      grid: s.grid,
      selectedIds: s.selectedIds,
      hoveredId: s.hoveredId,
      editingId: s.editingId,
      selectionFrame: frame,
      marquee: overlayRef.current.marquee,
      snapGuides: overlayRef.current.snapGuides,
      bindHighlight: overlayRef.current.bindHighlight,
      theme: useTheme.getState().resolved,
      bgStyle: s.canvasBg.style,
    });
  };

  // ── sizing ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const apply = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      sizeRef.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      scheduleRender();
      // frame the board once we know a real viewport size
      if (rect.width > 40 && framedRef.current !== boardIdRef.current) {
        framedRef.current = boardIdRef.current;
        const st = useEditor.getState();
        if (st.elements.length > 0) fitToContent();
        else centerOrigin();
      }
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // re-render on any store or theme change
  useEffect(() => {
    const unsub = useEditor.subscribe(scheduleRender);
    const unsubTheme = useTheme.subscribe(scheduleRender);
    scheduleRender();
    return () => {
      unsub();
      unsubTheme();
    };
  }, []);

  // ── camera helpers ─────────────────────────────────────────────────────────
  const zoomAt = (factor: number, center?: Point) => {
    const { camera, setCamera } = useEditor.getState();
    const { width, height } = sizeRef.current;
    const c = center ?? { x: width / 2, y: height / 2 };
    const before = screenToWorld(c, camera);
    const zoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    setCamera({ zoom, x: before.x - c.x / zoom, y: before.y - c.y / zoom });
  };
  const setZoom = (zoom: number, center?: Point) => {
    const { camera, setCamera } = useEditor.getState();
    const { width, height } = sizeRef.current;
    const c = center ?? { x: width / 2, y: height / 2 };
    const before = screenToWorld(c, camera);
    const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    setCamera({ zoom: z, x: before.x - c.x / z, y: before.y - c.y / z });
  };
  const centerOrigin = () => {
    const { width, height } = sizeRef.current;
    useEditor.getState().setCamera({ zoom: 1, x: -width / 2, y: -height / 2 });
  };
  const frameBounds = (b: Bounds, maxZoom = 1.2) => {
    const { width, height } = sizeRef.current;
    const pad = 100;
    if (b.width < 1 && b.height < 1) {
      centerOrigin();
      return;
    }
    const zoom = clamp(
      Math.min(width / (b.width + pad * 2), height / (b.height + pad * 2)),
      MIN_ZOOM,
      maxZoom,
    );
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    useEditor.getState().setCamera({
      zoom,
      x: cx - width / (2 * zoom),
      y: cy - height / (2 * zoom),
    });
  };
  const fitToContent = () => {
    const s = useEditor.getState();
    const b = commonBounds(s.elements.filter((e) => !e.hidden));
    if (b) frameBounds(b);
    else centerOrigin();
  };
  const zoomToSelection = () => {
    const s = useEditor.getState();
    const selSet = new Set(s.selectedIds);
    const b = commonBounds(s.elements.filter((e) => selSet.has(e.id)));
    if (b) frameBounds(b, 2);
    else fitToContent();
  };

  // ── images ───────────────────────────────────────────────────────────────
  const imageDims = (blob: Blob): Promise<{ w: number; h: number }> =>
    new Promise((resolve) => {
      if ('createImageBitmap' in window) {
        createImageBitmap(blob)
          .then((b) => resolve({ w: b.width, h: b.height }))
          .catch(() => resolve({ w: 320, h: 240 }));
      } else {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          resolve({ w: img.naturalWidth, h: img.naturalHeight });
          URL.revokeObjectURL(url);
        };
        img.onerror = () => resolve({ w: 320, h: 240 });
        img.src = url;
      }
    });

  const addImageFiles = async (files: File[] | FileList, at?: Point) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    const s = useEditor.getState();
    const { width, height } = sizeRef.current;
    const base = at ?? screenToWorld({ x: width / 2, y: height / 2 }, s.camera);
    let i = 0;
    for (const f of list) {
      const dims = await imageDims(f);
      const scale = Math.min(1, 480 / Math.max(dims.w, dims.h));
      const w = Math.max(20, dims.w * scale);
      const h = Math.max(20, dims.h * scale);
      const fileId = nanoid();
      await saveAsset({
        id: fileId,
        blob: f,
        type: f.type || 'image/png',
        width: dims.w,
        height: dims.h,
        createdAt: Date.now(),
      });
      cacheImage(fileId, f, scheduleRender);
      const el = createImage(base.x - w / 2 + i * 18, base.y - h / 2 + i * 18, w, h, fileId, useEditor.getState().style);
      useEditor.getState().addElement(el);
      i++;
    }
  };

  // register imperative controls once
  useEffect(() => {
    registerControls({
      zoomIn: () => zoomAt(ZOOM_STEP),
      zoomOut: () => zoomAt(1 / ZOOM_STEP),
      setZoom: (z) => setZoom(z),
      resetView: () => centerOrigin(),
      fitToContent,
      zoomToSelection,
      addImageFiles: (files) => addImageFiles(files),
      pickImage: () => fileInputRef.current?.click(),
      centerOn: (world) => {
        const { camera, setCamera } = useEditor.getState();
        const { width, height } = sizeRef.current;
        setCamera({
          ...camera,
          x: world.x - width / 2 / camera.zoom,
          y: world.y - height / 2 / camera.zoom,
        });
      },
    });
  }, []);

  // re-frame whenever a different board is loaded
  useEffect(() => {
    framedRef.current = null;
    if (sizeRef.current.width > 40) {
      framedRef.current = boardId;
      const s = useEditor.getState();
      if (s.elements.length > 0) fitToContent();
      else centerOrigin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  // ── input geometry ─────────────────────────────────────────────────────────
  const getScreen = (e: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const toWorld = (screen: Point): Point => screenToWorld(screen, useEditor.getState().camera);

  const topmostAt = (world: Point): Element | null => {
    const s = useEditor.getState();
    const pad = 8 / s.camera.zoom;
    for (let i = s.elements.length - 1; i >= 0; i--) {
      const el = s.elements[i];
      if (el.hidden || el.locked) continue;
      if (hitTest(el, world, pad)) return el;
    }
    return null;
  };

  const groupSiblings = (el: Element): string[] => {
    if (!el.groupId) return [el.id];
    const s = useEditor.getState();
    return s.elements.filter((e) => e.groupId === el.groupId).map((e) => e.id);
  };

  const setCursor = (c: string) => {
    if (canvasRef.current) canvasRef.current.style.cursor = c;
  };

  // ── pointer down ───────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* pointer may not be capturable (e.g. synthetic events) */
    }
    const screen = getScreen(e);
    pointersRef.current.set(e.pointerId, screen);

    // second finger → pinch
    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const { camera } = useEditor.getState();
      pinchRef.current = {
        dist: dist(pts[0], pts[1]),
        mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        cam: { ...camera },
      };
      cancelGesture();
      gestureRef.current = { ...emptyGesture(e.pointerId, screen, toWorld(screen)), mode: 'pinch' };
      return;
    }

    const s = useEditor.getState();
    const world = toWorld(screen);
    const panning = spaceRef.current || e.button === 1 || s.tool === 'pan';

    const g = emptyGesture(e.pointerId, screen, world);
    g.before = s.elements;
    g.beforeSelection = s.selectedIds;

    if (panning) {
      g.mode = 'pan';
      gestureRef.current = g;
      setCursor('grabbing');
      return;
    }

    if (s.tool === 'select') {
      const selSet = new Set(s.selectedIds);
      const selected = s.elements.filter((el) => selSet.has(el.id));
      const frame = getSelectionFrame(selected, s.camera);
      const handle = frame ? handleAtPoint(frame, screen) : null;
      if (handle) {
        g.origElements = selected;
        g.origBounds = commonBounds(selected);
        if (handle.type === 'rotate') {
          g.mode = 'rotate';
          g.groupCenter = g.origBounds
            ? { x: g.origBounds.x + g.origBounds.width / 2, y: g.origBounds.y + g.origBounds.height / 2 }
            : elementCenter(selected[0]);
          g.startAngle = Math.atan2(world.y - g.groupCenter.y, world.x - g.groupCenter.x);
        } else {
          g.mode = 'resize';
          g.handle = handle.type;
        }
        gestureRef.current = g;
        return;
      }

      const hit = topmostAt(world);
      if (hit) {
        const ids = groupSiblings(hit);
        if (e.shiftKey) {
          // toggle membership
          const has = s.selectedIds.includes(hit.id);
          const next = has
            ? s.selectedIds.filter((id) => !ids.includes(id))
            : Array.from(new Set([...s.selectedIds, ...ids]));
          s.setSelection(next);
        } else if (!s.selectedIds.includes(hit.id)) {
          s.setSelection(ids);
        }
        const after = useEditor.getState();
        const afterSel = new Set(after.selectedIds);
        g.origElements = after.elements.filter((el) => afterSel.has(el.id) && !el.locked);
        // dragging a frame carries its children (without selecting them)
        const carried = new Set(g.origElements.map((el) => el.id));
        for (const el of g.origElements) {
          if (el.type === 'frame') {
            for (const ch of childrenOf(el.id, after.elements)) {
              if (!carried.has(ch.id) && !ch.locked) {
                carried.add(ch.id);
                g.origElements.push(ch);
              }
            }
          }
        }
        g.origBounds = commonBounds(after.elements.filter((el) => afterSel.has(el.id)));
        g.mode = 'move';
        gestureRef.current = g;
        setCursor('move');
        return;
      }

      // empty space → marquee
      if (!e.shiftKey) s.clearSelection();
      g.mode = 'marquee';
      g.additive = e.shiftKey;
      gestureRef.current = g;
      return;
    }

    if (s.tool === 'frame') {
      const el = createFrame(world.x, world.y, 0, 0, s.style);
      s.addElement(el, { select: false });
      g.mode = 'create';
      g.newId = el.id;
      gestureRef.current = g;
      return;
    }

    if (DRAW_TOOLS.includes(s.tool)) {
      const el = createShape(s.tool as any, world.x, world.y, 0, 0, s.style);
      s.addElement(el, { select: false });
      g.mode = 'create';
      g.newId = el.id;
      gestureRef.current = g;
      return;
    }

    if (s.tool === 'line' || s.tool === 'arrow') {
      const startTarget = bindableAt(s.elements, world, 8 / s.camera.zoom);
      const el = createLinear(s.tool, world, world, s.style);
      if (startTarget) el.startBinding = { elementId: startTarget.id, gap: 6, focus: 0 };
      s.addElement(el, { select: false });
      g.mode = 'create-linear';
      g.newId = el.id;
      gestureRef.current = g;
      return;
    }

    if (s.tool === 'pen') {
      const el = createDraw(world, s.style);
      s.addElement(el, { select: false });
      g.mode = 'draw';
      g.newId = el.id;
      g.absPoints = [world];
      gestureRef.current = g;
      return;
    }

    if (s.tool === 'text') {
      const el = createText(world.x, world.y - (s.style.fontSize * 1.25) / 2, s.style);
      s.addElement(el);
      if (!s.lockTool) s.setTool('select');
      // setEditing must come after setTool — setTool clears editingId
      s.setEditing(el.id);
      return;
    }

    if (s.tool === 'sticky') {
      const el = createSticky(world.x - 90, world.y - 90, s.style);
      s.addElement(el);
      if (!s.lockTool) s.setTool('select');
      s.setEditing(el.id);
      return;
    }

    if (s.tool === 'image') {
      fileInputRef.current?.click();
      if (!s.lockTool) s.setTool('select');
      return;
    }

    if (s.tool === 'eraser') {
      g.mode = 'erase';
      gestureRef.current = g;
      eraseAt(world);
      return;
    }
  };

  // ── pointer move ───────────────────────────────────────────────────────────
  const onPointerMove = (e: React.PointerEvent) => {
    const screen = getScreen(e);
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, screen);
    const g = gestureRef.current;

    // pinch
    if (g?.mode === 'pinch' && pointersRef.current.size >= 2 && pinchRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const d = dist(pts[0], pts[1]);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const start = pinchRef.current;
      const zoom = clamp((start.cam.zoom * d) / (start.dist || 1), MIN_ZOOM, MAX_ZOOM);
      // keep the world point under the start midpoint stable, then pan by mid delta
      const worldAtMid = {
        x: start.cam.x + start.mid.x / start.cam.zoom,
        y: start.cam.y + start.mid.y / start.cam.zoom,
      };
      useEditor.getState().setCamera({
        zoom,
        x: worldAtMid.x - mid.x / zoom,
        y: worldAtMid.y - mid.y / zoom,
      });
      return;
    }

    if (!g) {
      // hover feedback in select mode
      hoverUpdate(screen);
      return;
    }

    const world = toWorld(screen);
    const s = useEditor.getState();

    switch (g.mode) {
      case 'pan': {
        const dx = screen.x - g.lastScreen.x;
        const dy = screen.y - g.lastScreen.y;
        const cam = s.camera;
        s.setCamera({ ...cam, x: cam.x - dx / cam.zoom, y: cam.y - dy / cam.zoom });
        g.lastScreen = screen;
        break;
      }
      case 'create': {
        let b = boundsFromDrag(g.startWorld, world);
        if (e.shiftKey) {
          const side = Math.max(b.width, b.height);
          b = {
            x: world.x < g.startWorld.x ? g.startWorld.x - side : g.startWorld.x,
            y: world.y < g.startWorld.y ? g.startWorld.y - side : g.startWorld.y,
            width: side,
            height: side,
          };
        }
        updateById(g.newId!, (el) => ({ ...el, x: b.x, y: b.y, width: Math.max(b.width, 1), height: Math.max(b.height, 1) }));
        g.moved = true;
        break;
      }
      case 'create-linear': {
        let end = world;
        if (e.shiftKey) end = constrainAngle(g.startWorld, world);
        updateById(g.newId!, (el) => {
          const next = {
            ...el,
            x: g.startWorld.x,
            y: g.startWorld.y,
            points: [
              { x: 0, y: 0 },
              { x: end.x - g.startWorld.x, y: end.y - g.startWorld.y },
            ],
          };
          return normalizePoints(next);
        });
        // keep a bound start attached to its target as the end is dragged
        const cur = useEditor.getState();
        cur.setElements(refreshConnectors(cur.elements, new Set([g.newId!])));
        // highlight a bindable target under the moving end
        overlayRef.current.bindHighlight = bindableAt(s.elements, world, 8 / s.camera.zoom, g.newId!)?.id ?? null;
        g.moved = true;
        break;
      }
      case 'draw': {
        const last = g.absPoints[g.absPoints.length - 1];
        if (dist(world, last) < 1.5 / s.camera.zoom) break;
        g.absPoints.push(world);
        const origin = g.absPoints[0];
        updateById(g.newId!, (el) => {
          const next = {
            ...el,
            x: origin.x,
            y: origin.y,
            points: g.absPoints.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y })),
          };
          return normalizePoints(next);
        });
        g.moved = true;
        break;
      }
      case 'move': {
        let dx = world.x - g.startWorld.x;
        let dy = world.y - g.startWorld.y;
        overlayRef.current.snapGuides = [];
        if (s.snap && g.origBounds) {
          const moving = { x: g.origBounds.x + dx, y: g.origBounds.y + dy, width: g.origBounds.width, height: g.origBounds.height };
          const selSet = new Set(g.origElements.map((el) => el.id));
          const others = s.elements.filter((el) => !selSet.has(el.id) && !el.hidden);
          const snap = computeSnap(moving, others, SNAP_THRESHOLD / s.camera.zoom, s.grid ? GRID_SIZE : null);
          dx += snap.dx;
          dy += snap.dy;
          overlayRef.current.snapGuides = snap.guides.map((gd) => {
            const a = worldToScreen({ x: gd.x1, y: gd.y1 }, s.camera);
            const b = worldToScreen({ x: gd.x2, y: gd.y2 }, s.camera);
            return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
          });
        }
        const moved = moveElements(g.origElements, dx, dy);
        replaceMany(moved);
        g.moved = true;
        break;
      }
      case 'resize': {
        if (!g.origBounds || !g.handle) break;
        const resized = resizeElements(g.origElements, g.origBounds, g.handle, world, e.shiftKey);
        replaceMany(resized);
        g.moved = true;
        break;
      }
      case 'rotate': {
        if (!g.groupCenter || g.startAngle == null) break;
        const a = Math.atan2(world.y - g.groupCenter.y, world.x - g.groupCenter.x);
        let delta = a - g.startAngle;
        if (e.shiftKey) {
          const step = Math.PI / 12;
          delta = Math.round(delta / step) * step;
        }
        const rotated = rotateElements(g.origElements, g.groupCenter, delta);
        replaceMany(rotated);
        g.moved = true;
        break;
      }
      case 'marquee': {
        overlayRef.current.marquee = {
          x: Math.min(g.startScreen.x, screen.x),
          y: Math.min(g.startScreen.y, screen.y),
          width: Math.abs(screen.x - g.startScreen.x),
          height: Math.abs(screen.y - g.startScreen.y),
        };
        const box = boundsFromDrag(g.startWorld, world);
        const hits = s.elements
          .filter((el) => !el.hidden && !el.locked && intersectsBox(el, box))
          .map((el) => el.id);
        const next = g.additive ? Array.from(new Set([...g.beforeSelection, ...hits])) : hits;
        s.setSelection(next);
        scheduleRender();
        break;
      }
      case 'erase': {
        eraseAt(world);
        break;
      }
    }
  };

  // ── pointer up ─────────────────────────────────────────────────────────────
  const onPointerUp = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    try {
      if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    pointersRef.current.delete(e.pointerId);
    const g = gestureRef.current;

    if (g?.mode === 'pinch') {
      if (pointersRef.current.size < 2) {
        pinchRef.current = null;
        gestureRef.current = null;
      }
      return;
    }
    if (!g) return;

    const s = useEditor.getState();

    switch (g.mode) {
      case 'create': {
        const el = s.elements.find((x) => x.id === g.newId);
        if (el && el.width < 4 && el.height < 4) {
          const def = defaultSizeFor(el.type);
          updateById(g.newId!, (x) => ({
            ...x,
            x: g.startWorld.x - def.w / 2,
            y: g.startWorld.y - def.h / 2,
            width: def.w,
            height: def.h,
          }));
        }
        if (!s.lockTool) s.setTool('select');
        s.setSelection([g.newId!]);
        // a new frame may enclose existing elements; a new shape may land in one
        const created = useEditor.getState().elements.find((x) => x.id === g.newId);
        if (created?.type === 'frame') useEditor.getState().applyMembership();
        else if (hasFrames(useEditor.getState().elements)) useEditor.getState().applyMembership(new Set([g.newId!]));
        break;
      }
      case 'create-linear': {
        const el = s.elements.find((x) => x.id === g.newId);
        const len = el ? Math.hypot(el.width, el.height) : 0;
        if (!el || len < 6) {
          s.setElements(s.elements.filter((x) => x.id !== g.newId));
        } else {
          // bind the end to an element under the released pointer
          const endWorld = toWorld(getScreen(e));
          const endTarget = bindableAt(s.elements, endWorld, 8 / s.camera.zoom, el.id);
          let next = el;
          if (endTarget && endTarget.id !== el.startBinding?.elementId) {
            next = { ...el, endBinding: { elementId: endTarget.id, gap: 6, focus: 0 } };
          }
          const replaced = s.elements.map((x) => (x.id === el.id ? next : x));
          s.setElements(refreshConnectors(replaced, new Set([el.id])));
          s.setSelection([g.newId!]);
        }
        overlayRef.current.bindHighlight = null;
        if (!s.lockTool) s.setTool('select');
        break;
      }
      case 'draw': {
        const el = s.elements.find((x) => x.id === g.newId);
        if (el && s.autoShape) {
          const shape = recognizeShape(el, s.style);
          if (shape) {
            const replaced = { ...shape, id: el.id };
            s.setElements(s.elements.map((x) => (x.id === el.id ? replaced : x)));
          }
        }
        if (el) s.setSelection([el.id]);
        if (el && hasFrames(useEditor.getState().elements)) useEditor.getState().applyMembership(new Set([el.id]));
        if (!s.lockTool) s.setTool('select');
        break;
      }
      case 'move':
      case 'resize':
      case 'rotate':
      case 'erase': {
        if (g.moved) {
          if (hasFrames(useEditor.getState().elements)) {
            useEditor.getState().applyMembership(new Set(g.origElements.map((e) => e.id)));
          }
          s.commit(g.before);
        }
        break;
      }
      case 'marquee':
        break;
    }

    overlayRef.current.marquee = null;
    overlayRef.current.snapGuides = [];
    overlayRef.current.bindHighlight = null;
    gestureRef.current = null;
    scheduleRender();
  };

  // ── helpers used by handlers ────────────────────────────────────────────────
  const updateById = (id: string, fn: (el: Element) => Element) => {
    const s = useEditor.getState();
    s.setElements(s.elements.map((el) => (el.id === id ? fn(el) : el)));
  };
  const replaceMany = (updated: Element[]) => {
    const map = new Map(updated.map((el) => [el.id, el]));
    const s = useEditor.getState();
    const next = s.elements.map((el) => map.get(el.id) ?? el);
    s.setElements(refreshConnectors(next, new Set(map.keys())));
  };
  const eraseAt = (world: Point) => {
    const hit = topmostAt(world);
    if (hit && !hit.locked) {
      const s = useEditor.getState();
      s.setElements(s.elements.filter((el) => el.id !== hit.id));
      gestureRef.current && (gestureRef.current.moved = true);
    }
  };
  const cancelGesture = () => {
    const g = gestureRef.current;
    if (!g) return;
    if ((g.mode === 'create' || g.mode === 'create-linear' || g.mode === 'draw') && g.newId) {
      const s = useEditor.getState();
      s.setElements(s.elements.filter((x) => x.id !== g.newId));
    }
    gestureRef.current = null;
    overlayRef.current.marquee = null;
    overlayRef.current.snapGuides = [];
  };

  const hoverUpdate = (screen: Point) => {
    const s = useEditor.getState();
    if (s.tool !== 'select') {
      setCursor(s.tool === 'text' ? 'text' : s.tool === 'pan' ? 'grab' : 'crosshair');
      if (s.hoveredId) s.setHovered(null);
      // show which element an arrow/line would bind to
      if (s.tool === 'arrow' || s.tool === 'line') {
        const id = bindableAt(s.elements, toWorld(screen), 8 / s.camera.zoom)?.id ?? null;
        if (overlayRef.current.bindHighlight !== id) {
          overlayRef.current.bindHighlight = id;
          scheduleRender();
        }
      } else if (overlayRef.current.bindHighlight) {
        overlayRef.current.bindHighlight = null;
        scheduleRender();
      }
      return;
    }
    if (spaceRef.current) {
      setCursor('grab');
      return;
    }
    const selSet = new Set(s.selectedIds);
    const selected = s.elements.filter((el) => selSet.has(el.id));
    const frame = getSelectionFrame(selected, s.camera);
    const handle = frame ? handleAtPoint(frame, screen) : null;
    if (handle) {
      setCursor(cursorForHandle(handle.type));
      return;
    }
    const world = toWorld(screen);
    const hit = topmostAt(world);
    s.setHovered(hit ? hit.id : null);
    setCursor(hit ? 'move' : 'default');
  };

  // ── double click → text ─────────────────────────────────────────────────────
  const onDoubleClick = (e: React.MouseEvent) => {
    const screen = getScreen(e);
    const world = toWorld(screen);
    const s = useEditor.getState();
    const hit = topmostAt(world);
    if (hit && (hit.type === 'text' || hit.type === 'sticky')) {
      s.setSelection([hit.id]);
      s.setEditing(hit.id);
      return;
    }
    if (!hit) {
      const el = createText(world.x, world.y - (s.style.fontSize * 1.25) / 2, s.style);
      s.addElement(el);
      s.setEditing(el.id);
    }
  };

  // ── wheel (native, non-passive) ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const screen = getScreen(e);
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.01), screen);
      } else {
        const { camera, setCamera } = useEditor.getState();
        setCamera({ ...camera, x: camera.x + e.deltaX / camera.zoom, y: camera.y + e.deltaY / camera.zoom });
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // ── space-to-pan ────────────────────────────────────────────────────────────
  useEffect(() => {
    const isTyping = () => {
      const a = document.activeElement;
      return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || (a as HTMLElement).isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping() && !spaceRef.current) {
        spaceRef.current = true;
        if (!gestureRef.current) setCursor('grab');
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false;
        if (!gestureRef.current) setCursor('default');
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ── paste (images + text) ───────────────────────────────────────────────────
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const a = document.activeElement;
      if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT')) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgFiles: File[] = [];
      for (const it of Array.from(items)) {
        if (it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) imgFiles.push(f);
        }
      }
      if (imgFiles.length) {
        e.preventDefault();
        addImageFiles(imgFiles);
        return;
      }
      const text = e.clipboardData?.getData('text/plain');
      if (text && text.trim()) {
        e.preventDefault();
        const s = useEditor.getState();
        const { width, height } = sizeRef.current;
        const c = screenToWorld({ x: width / 2, y: height / 2 }, s.camera);
        const el = createText(c.x - 100, c.y - 12, s.style);
        el.text = text;
        s.addElement(el);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // cursor sync on tool change
  useEffect(() => {
    if (gestureRef.current) return;
    if (tool !== 'arrow' && tool !== 'line' && overlayRef.current.bindHighlight) {
      overlayRef.current.bindHighlight = null;
      scheduleRender();
    }
    setCursor(
      tool === 'select' ? 'default' : tool === 'text' ? 'text' : tool === 'pan' ? 'grab' : 'crosshair',
    );
  }, [tool]);

  // ── drag & drop images ──────────────────────────────────────────────────────
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer?.files?.length) return;
    const screen = getScreen(e);
    addImageFiles(e.dataTransfer.files, toWorld(screen));
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 touch-none select-none"
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      />
      {editingId && <TextEditor />}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addImageFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ── module helpers ─────────────────────────────────────────────────────────────

function emptyGesture(pointerId: number, screen: Point, world: Point): Gesture {
  return {
    mode: 'idle',
    pointerId,
    startScreen: screen,
    startWorld: world,
    lastScreen: screen,
    before: [],
    origElements: [],
    origBounds: null,
    absPoints: [],
    moved: false,
    beforeSelection: [],
    additive: false,
  };
}

function defaultSizeFor(type: Element['type']): { w: number; h: number } {
  switch (type) {
    case 'ellipse':
      return { w: 120, h: 120 };
    case 'diamond':
      return { w: 130, h: 130 };
    case 'triangle':
      return { w: 130, h: 110 };
    case 'frame':
      return { w: 640, h: 360 };
    default:
      return { w: 150, h: 100 };
  }
}

function constrainAngle(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(angle / step) * step;
  const len = Math.hypot(dx, dy);
  return { x: start.x + Math.cos(snapped) * len, y: start.y + Math.sin(snapped) * len };
}
