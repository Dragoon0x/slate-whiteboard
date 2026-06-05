import type { Camera, Element, Point } from './types';

// ── Coordinate transforms ────────────────────────────────────────────────────
// (cam.x, cam.y) is the world point shown at the viewport's top-left corner.

export function worldToScreen(p: Point, cam: Camera): Point {
  return { x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom };
}

export function screenToWorld(p: Point, cam: Camera): Point {
  return { x: p.x / cam.zoom + cam.x, y: p.y / cam.zoom + cam.y };
}

// ── Vector helpers ───────────────────────────────────────────────────────────

export function rotatePoint(p: Point, center: Point, angle: number): Point {
  if (!angle) return { x: p.x, y: p.y };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function elementCenter(el: Element): Point {
  return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ── Bounds ───────────────────────────────────────────────────────────────────

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Axis-aligned bounding box of an element, accounting for its rotation.
export function elementAABB(el: Element): Bounds {
  const c = elementCenter(el);
  const corners: Point[] = [
    { x: el.x, y: el.y },
    { x: el.x + el.width, y: el.y },
    { x: el.x + el.width, y: el.y + el.height },
    { x: el.x, y: el.y + el.height },
  ].map((p) => rotatePoint(p, c, el.angle));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

// Union AABB of many elements (the selection box).
export function commonBounds(els: Element[]): Bounds | null {
  if (els.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of els) {
    const b = elementAABB(el);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function boundsFromDrag(a: Point, b: Point): Bounds {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

// ── Hit testing ──────────────────────────────────────────────────────────────

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const l2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  if (l2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Is a world-space point inside / on an element, within `pad` world units.
export function hitTest(el: Element, world: Point, pad: number): boolean {
  if (el.hidden) return false;
  const c = elementCenter(el);
  const local = rotatePoint(world, c, -el.angle);
  const { x, y, width: w, height: h } = el;

  switch (el.type) {
    case 'rectangle':
    case 'sticky':
    case 'image':
    case 'text':
    case 'frame':
      return local.x >= x - pad && local.x <= x + w + pad && local.y >= y - pad && local.y <= y + h + pad;
    case 'ellipse': {
      const rx = w / 2 + pad;
      const ry = h / 2 + pad;
      if (rx <= 0 || ry <= 0) return false;
      const nx = (local.x - (x + w / 2)) / rx;
      const ny = (local.y - (y + h / 2)) / ry;
      return nx * nx + ny * ny <= 1;
    }
    case 'diamond': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const dx = Math.abs(local.x - cx) / (w / 2 + pad);
      const dy = Math.abs(local.y - cy) / (h / 2 + pad);
      return dx + dy <= 1;
    }
    case 'triangle': {
      const poly: Point[] = [
        { x: x + w / 2, y: y - pad },
        { x: x - pad, y: y + h + pad },
        { x: x + w + pad, y: y + h + pad },
      ];
      return pointInPolygon(local, poly);
    }
    case 'line':
    case 'arrow':
    case 'draw': {
      const pts = el.points ?? [];
      const tol = Math.max(pad, el.strokeWidth / 2 + 4);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = { x: x + pts[i].x, y: y + pts[i].y };
        const b = { x: x + pts[i + 1].x, y: y + pts[i + 1].y };
        if (distanceToSegment(local, a, b) <= tol) return true;
      }
      // single-point dot
      if (pts.length === 1) return dist(local, { x: x + pts[0].x, y: y + pts[0].y }) <= tol;
      return false;
    }
    default:
      return false;
  }
}

// Does an element's AABB intersect a world-space rectangle (selection marquee)?
export function intersectsBox(el: Element, box: Bounds): boolean {
  const b = elementAABB(el);
  return !(
    b.x > box.x + box.width ||
    b.x + b.width < box.x ||
    b.y > box.y + box.height ||
    b.y + b.height < box.y
  );
}

// ── Point geometry maintenance ───────────────────────────────────────────────
// Keep an element's x/y/width/height in sync with its relative points, shifting
// points so the minimum corner sits at (0,0).

export function normalizePoints(el: Element): Element {
  if (!el.points || el.points.length === 0) return el;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of el.points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const points = el.points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
  return {
    ...el,
    points,
    x: el.x + minX,
    y: el.y + minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function roundTo(v: number, step: number): number {
  return Math.round(v / step) * step;
}
