import { createLinear, createShape } from './factory';
import { dist } from './geometry';
import type { Element, Point, StyleDefaults } from './types';

// Rough-sketch → clean-shape recognition. Operates on a freehand 'draw' element's
// points and returns a replacement element, or null when no confident match.

function perpDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

function rdp(points: Point[], eps: number): Point[] {
  if (points.length < 3) return points.slice();
  let maxD = 0;
  let idx = 0;
  const a = points[0];
  const b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDistance(points[i], a, b);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) {
    const left = rdp(points.slice(0, idx + 1), eps);
    const right = rdp(points.slice(idx), eps);
    return [...left.slice(0, -1), ...right];
  }
  return [a, b];
}

function angleAt(prev: Point, cur: Point, next: Point): number {
  const v1x = prev.x - cur.x;
  const v1y = prev.y - cur.y;
  const v2x = next.x - cur.x;
  const v2y = next.y - cur.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y) || 1;
  const m2 = Math.hypot(v2x, v2y) || 1;
  const cos = Math.max(-1, Math.min(1, dot / (m1 * m2)));
  return Math.acos(cos); // interior angle; a corner ≈ small (sharp turn)
}

export function recognizeShape(el: Element, style: StyleDefaults): Element | null {
  const pts = el.points;
  if (!pts || pts.length < 6) return null;

  // absolute points
  const abs = pts.map((p) => ({ x: el.x + p.x, y: el.y + p.y }));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of abs) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const bw = maxX - minX;
  const bh = maxY - minY;
  const diag = Math.hypot(bw, bh);
  if (diag < 24) return null;

  const closed = dist(abs[0], abs[abs.length - 1]) < diag * 0.3;
  const simplified = rdp(abs, diag * 0.045);
  // drop duplicate closing vertex
  const verts = simplified.slice();
  if (verts.length > 2 && dist(verts[0], verts[verts.length - 1]) < diag * 0.08) verts.pop();
  const n = verts.length;

  // count sharp corners
  let corners = 0;
  const len = verts.length;
  const range = closed ? len : len - 1;
  for (let i = closed ? 0 : 1; i < range; i++) {
    const prev = verts[(i - 1 + len) % len];
    const cur = verts[i];
    const next = verts[(i + 1) % len];
    const a = angleAt(prev, cur, next);
    if (a < Math.PI - 0.6) corners++; // turn > ~34°
  }

  const mkInherit = (newEl: Element): Element => ({
    ...newEl,
    strokeColor: el.strokeColor === 'transparent' ? style.strokeColor : el.strokeColor,
    strokeWidth: el.strokeWidth,
    strokeStyle: el.strokeStyle,
    opacity: el.opacity,
    backgroundColor: el.backgroundColor,
    fillStyle: el.fillStyle,
  });

  // straight line
  if (!closed && corners <= 1) {
    return mkInherit(createLinear('line', abs[0], abs[abs.length - 1], style));
  }

  if (closed || n >= 3) {
    if (corners === 3) {
      return mkInherit(createShape('triangle', minX, minY, bw, bh, style));
    }
    if (corners === 4) {
      // rectangle vs diamond by where the corners sit in the bbox
      let cornerLike = 0;
      for (const v of verts) {
        const nx = (v.x - minX) / (bw || 1);
        const ny = (v.y - minY) / (bh || 1);
        const nearCornerX = nx < 0.25 || nx > 0.75;
        const nearCornerY = ny < 0.25 || ny > 0.75;
        if (nearCornerX && nearCornerY) cornerLike++;
      }
      const type = cornerLike >= 3 ? 'rectangle' : 'diamond';
      const shape = createShape(type, minX, minY, bw, bh, style);
      if (type === 'rectangle') shape.roundness = 0;
      return mkInherit(shape);
    }
    if (corners <= 2 || corners >= 5) {
      return mkInherit(createShape('ellipse', minX, minY, bw, bh, style));
    }
  }

  return null;
}
