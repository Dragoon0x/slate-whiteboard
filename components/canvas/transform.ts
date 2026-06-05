import { commonBounds, elementAABB, elementCenter, rotatePoint } from '@/lib/geometry';
import type { Bounds } from '@/lib/geometry';
import type { Element, Point } from '@/lib/types';
import type { HandleType } from './handles';

const MIN_SIZE = 2;

// ── move ─────────────────────────────────────────────────────────────────────

export function moveElements(orig: Element[], dx: number, dy: number): Element[] {
  return orig.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy, updated: Date.now() }));
}

// ── resize ───────────────────────────────────────────────────────────────────

const affectsLeft = (h: HandleType) => h === 'nw' || h === 'w' || h === 'sw';
const affectsRight = (h: HandleType) => h === 'ne' || h === 'e' || h === 'se';
const affectsTop = (h: HandleType) => h === 'nw' || h === 'n' || h === 'ne';
const affectsBottom = (h: HandleType) => h === 'sw' || h === 's' || h === 'se';
const isCorner = (h: HandleType) =>
  h === 'nw' || h === 'ne' || h === 'se' || h === 'sw';

function scalePoints(points: Point[] | undefined, sx: number, sy: number): Point[] | undefined {
  return points ? points.map((p) => ({ x: p.x * sx, y: p.y * sy })) : undefined;
}

// Single-element resize that stays correct under rotation by working in the
// element's un-rotated frame (rotate the pointer by -angle around the center).
function resizeSingle(el: Element, handle: HandleType, world: Point): Element {
  const c = elementCenter(el);
  const P = rotatePoint(world, c, -el.angle);
  let x0 = el.x;
  let y0 = el.y;
  let x1 = el.x + el.width;
  let y1 = el.y + el.height;

  if (affectsLeft(handle)) x0 = P.x;
  if (affectsRight(handle)) x1 = P.x;
  if (affectsTop(handle)) y0 = P.y;
  if (affectsBottom(handle)) y1 = P.y;

  let nx = Math.min(x0, x1);
  let ny = Math.min(y0, y1);
  let nw = Math.max(Math.abs(x1 - x0), MIN_SIZE);
  let nh = Math.max(Math.abs(y1 - y0), MIN_SIZE);

  // map the new (un-rotated) center back into world space
  const newCenterUnrot = { x: nx + nw / 2, y: ny + nh / 2 };
  const cPrime = rotatePoint(newCenterUnrot, c, el.angle);

  const sx = nw / el.width;
  const sy = nh / el.height;
  const next: Element = {
    ...el,
    x: cPrime.x - nw / 2,
    y: cPrime.y - nh / 2,
    width: nw,
    height: nh,
    points: scalePoints(el.points, sx, sy),
    updated: Date.now(),
  };
  if ((el.type === 'text' || el.type === 'sticky') && el.fontSize && isCorner(handle)) {
    next.fontSize = Math.max(6, Math.round(el.fontSize * ((sx + sy) / 2)));
  }
  return next;
}

// Multi-selection resize: uniform-ish scaling of the axis-aligned union box.
function resizeMulti(
  orig: Element[],
  bounds: Bounds,
  handle: HandleType,
  world: Point,
  keepAspect: boolean,
): Element[] {
  const anchorX = affectsLeft(handle) ? bounds.x + bounds.width : bounds.x;
  const anchorY = affectsTop(handle) ? bounds.y + bounds.height : bounds.y;

  let sx = 1;
  let sy = 1;
  if (affectsLeft(handle) || affectsRight(handle)) {
    sx = Math.max(Math.abs(world.x - anchorX), MIN_SIZE) / Math.max(bounds.width, MIN_SIZE);
  }
  if (affectsTop(handle) || affectsBottom(handle)) {
    sy = Math.max(Math.abs(world.y - anchorY), MIN_SIZE) / Math.max(bounds.height, MIN_SIZE);
  }
  if (keepAspect && isCorner(handle)) {
    const s = Math.max(sx, sy);
    sx = s;
    sy = s;
  }

  return orig.map((e) => {
    const next: Element = {
      ...e,
      x: anchorX + (e.x - anchorX) * sx,
      y: anchorY + (e.y - anchorY) * sy,
      width: Math.max(e.width * sx, MIN_SIZE),
      height: Math.max(e.height * sy, MIN_SIZE),
      points: scalePoints(e.points, sx, sy),
      updated: Date.now(),
    };
    if ((e.type === 'text' || e.type === 'sticky') && e.fontSize) {
      next.fontSize = Math.max(6, Math.round(e.fontSize * ((sx + sy) / 2)));
    }
    return next;
  });
}

export function resizeElements(
  orig: Element[],
  bounds: Bounds,
  handle: HandleType,
  world: Point,
  keepAspect: boolean,
): Element[] {
  if (orig.length === 1) return [resizeSingle(orig[0], handle, world)];
  return resizeMulti(orig, bounds, handle, world, keepAspect);
}

// ── rotate ───────────────────────────────────────────────────────────────────

export function rotateElements(
  orig: Element[],
  groupCenter: Point,
  delta: number,
): Element[] {
  return orig.map((e) => {
    const c = elementCenter(e);
    const nc = rotatePoint(c, groupCenter, delta);
    return {
      ...e,
      angle: e.angle + delta,
      x: nc.x - e.width / 2,
      y: nc.y - e.height / 2,
      updated: Date.now(),
    };
  });
}

// ── snapping ─────────────────────────────────────────────────────────────────

export interface SnapResult {
  dx: number;
  dy: number;
  guides: { x1: number; y1: number; x2: number; y2: number }[]; // world coords
}

export function computeSnap(
  movingBounds: Bounds,
  others: Element[],
  threshold: number,
  gridSize: number | null,
): SnapResult {
  const guides: SnapResult['guides'] = [];
  const tb = movingBounds;
  const txs = [tb.x, tb.x + tb.width / 2, tb.x + tb.width];
  const tys = [tb.y, tb.y + tb.height / 2, tb.y + tb.height];

  let bestX: { off: number; at: number; span: [number, number] } | null = null;
  let bestY: { off: number; at: number; span: [number, number] } | null = null;

  for (const o of others) {
    const ob = elementAABB(o);
    const oxs = [ob.x, ob.x + ob.width / 2, ob.x + ob.width];
    const oys = [ob.y, ob.y + ob.height / 2, ob.y + ob.height];
    for (const tx of txs) {
      for (const ox of oxs) {
        const d = ox - tx;
        if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.off))) {
          bestX = {
            off: d,
            at: ox,
            span: [Math.min(tb.y, ob.y), Math.max(tb.y + tb.height, ob.y + ob.height)],
          };
        }
      }
    }
    for (const ty of tys) {
      for (const oy of oys) {
        const d = oy - ty;
        if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.off))) {
          bestY = {
            off: d,
            at: oy,
            span: [Math.min(tb.x, ob.x), Math.max(tb.x + tb.width, ob.x + ob.width)],
          };
        }
      }
    }
  }

  let dx = bestX?.off ?? 0;
  let dy = bestY?.off ?? 0;

  // fall back to grid snapping on axes with no object snap
  if (gridSize) {
    if (!bestX) {
      const snapped = Math.round(tb.x / gridSize) * gridSize;
      if (Math.abs(snapped - tb.x) <= threshold) dx = snapped - tb.x;
    }
    if (!bestY) {
      const snapped = Math.round(tb.y / gridSize) * gridSize;
      if (Math.abs(snapped - tb.y) <= threshold) dy = snapped - tb.y;
    }
  }

  if (bestX) guides.push({ x1: bestX.at, y1: bestX.span[0] - 20, x2: bestX.at, y2: bestX.span[1] + 20 });
  if (bestY) guides.push({ x1: bestY.span[0] - 20, y1: bestY.at, x2: bestY.span[1] + 20, y2: bestY.at });

  return { dx, dy, guides };
}

export { commonBounds };
