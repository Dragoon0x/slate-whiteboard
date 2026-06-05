import { commonBounds, elementAABB, normalizePoints } from './geometry';
import type { Element } from './types';

export type AlignAxis = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';
export type DistributeDir = 'horizontal' | 'vertical';

// Align each selected element's axis-aligned box to the shared edge/center.
// Deltas are computed on the AABB but applied to x/y — correct under rotation
// because translation commutes with rotation.
export function alignElements(els: Element[], axis: AlignAxis): Element[] {
  if (els.length < 2) return els;
  const bounds = commonBounds(els);
  if (!bounds) return els;
  return els.map((e) => {
    const b = elementAABB(e);
    let dx = 0;
    let dy = 0;
    switch (axis) {
      case 'left':
        dx = bounds.x - b.x;
        break;
      case 'right':
        dx = bounds.x + bounds.width - (b.x + b.width);
        break;
      case 'centerX':
        dx = bounds.x + bounds.width / 2 - (b.x + b.width / 2);
        break;
      case 'top':
        dy = bounds.y - b.y;
        break;
      case 'bottom':
        dy = bounds.y + bounds.height - (b.y + b.height);
        break;
      case 'centerY':
        dy = bounds.y + bounds.height / 2 - (b.y + b.height / 2);
        break;
    }
    return dx || dy ? { ...e, x: e.x + dx, y: e.y + dy, updated: Date.now() } : e;
  });
}

// Equalize the gaps between elements (first/last stay put). Needs >= 3.
export function distributeElements(els: Element[], dir: DistributeDir): Element[] {
  if (els.length < 3) return els;
  const horiz = dir === 'horizontal';
  const items = els.map((e) => ({ e, b: elementAABB(e) }));
  const sorted = [...items].sort((p, q) => (horiz ? p.b.x - q.b.x : p.b.y - q.b.y));
  const first = sorted[0].b;
  const last = sorted[sorted.length - 1].b;
  const startEdge = horiz ? first.x : first.y;
  const endEdge = horiz ? last.x + last.width : last.y + last.height;
  const totalSize = sorted.reduce((s, it) => s + (horiz ? it.b.width : it.b.height), 0);
  const gap = (endEdge - startEdge - totalSize) / (sorted.length - 1);

  let cursor = startEdge;
  const moved = new Map<string, Element>();
  for (const it of sorted) {
    const lead = horiz ? it.b.x : it.b.y;
    const delta = cursor - lead;
    moved.set(
      it.e.id,
      delta
        ? horiz
          ? { ...it.e, x: it.e.x + delta, updated: Date.now() }
          : { ...it.e, y: it.e.y + delta, updated: Date.now() }
        : it.e,
    );
    cursor += (horiz ? it.b.width : it.b.height) + gap;
  }
  return els.map((e) => moved.get(e.id) ?? e);
}

// Mirror the selection across its center. Closed shapes / images / text use the
// flipX/flipY render flags; point strokes mirror their points directly so their
// hit geometry stays in sync.
export function flipElements(els: Element[], dir: DistributeDir): Element[] {
  if (els.length === 0) return els;
  const bounds = commonBounds(els);
  if (!bounds) return els;
  const horiz = dir === 'horizontal';
  const axisX = bounds.x + bounds.width / 2;
  const axisY = bounds.y + bounds.height / 2;

  return els.map((e) => {
    const b = elementAABB(e);
    let x = e.x;
    let y = e.y;
    if (horiz) {
      const mirroredLeft = 2 * axisX - (b.x + b.width);
      x = e.x + (mirroredLeft - b.x);
    } else {
      const mirroredTop = 2 * axisY - (b.y + b.height);
      y = e.y + (mirroredTop - b.y);
    }

    if (e.type === 'line' || e.type === 'arrow' || e.type === 'draw') {
      const pts = (e.points ?? []).map((p) => ({
        x: horiz ? e.width - p.x : p.x,
        y: horiz ? p.y : e.height - p.y,
      }));
      return normalizePoints({ ...e, x, y, points: pts, updated: Date.now() });
    }
    return horiz
      ? { ...e, x, flipX: !e.flipX, updated: Date.now() }
      : { ...e, y, flipY: !e.flipY, updated: Date.now() };
  });
}
