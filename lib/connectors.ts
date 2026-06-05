import type { Bounds } from './geometry';
import { dist, elementAABB, elementCenter, hitTest, normalizePoints } from './geometry';
import type { Element, Point } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Connector binding: arrows/lines whose endpoints attach to other elements and
// reroute whenever those elements move, resize, or rotate. All functions are
// pure and immutable so they slot into the existing gesture/store pipeline.
// ─────────────────────────────────────────────────────────────────────────────

// Where a ray from a box center toward `toward` crosses the box border.
export function intersectAABBfromCenter(b: Bounds, toward: Point): Point {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = b.width / 2 || 1e-6;
  const hh = b.height / 2 || 1e-6;
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function applyGap(border: Point, center: Point, gap: number): Point {
  if (!gap) return border;
  const vx = border.x - center.x;
  const vy = border.y - center.y;
  const len = Math.hypot(vx, vy) || 1;
  return { x: border.x + (vx / len) * gap, y: border.y + (vy / len) * gap };
}

function attach(target: Element, toward: Point, gap: number): Point {
  return applyGap(intersectAABBfromCenter(elementAABB(target), toward), elementCenter(target), gap);
}

function isConnector(el: Element): boolean {
  return el.type === 'arrow' || el.type === 'line';
}

// Recompute the geometry of every bound connector. Returns the same array
// reference when nothing changed so downstream change-detection stays cheap.
export function refreshConnectors(elements: Element[], changedIds?: Set<string>): Element[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  let mutated = false;

  const out = elements.map((el) => {
    if (!isConnector(el) || (!el.startBinding && !el.endBinding)) return el;
    if (
      changedIds &&
      !changedIds.has(el.id) &&
      !(el.startBinding && changedIds.has(el.startBinding.elementId)) &&
      !(el.endBinding && changedIds.has(el.endBinding.elementId))
    ) {
      return el;
    }

    const startT = el.startBinding ? byId.get(el.startBinding.elementId) : undefined;
    const endT = el.endBinding ? byId.get(el.endBinding.elementId) : undefined;
    if (!startT && !endT) return el;

    const pts = el.points ?? [
      { x: 0, y: 0 },
      { x: el.width, y: el.height },
    ];
    const startFree = { x: el.x + pts[0].x, y: el.y + pts[0].y };
    const endFree = { x: el.x + pts[pts.length - 1].x, y: el.y + pts[pts.length - 1].y };

    let startWorld = startFree;
    let endWorld = endFree;
    if (startT && endT) {
      startWorld = attach(startT, elementCenter(endT), el.startBinding!.gap);
      endWorld = attach(endT, elementCenter(startT), el.endBinding!.gap);
    } else if (startT) {
      startWorld = attach(startT, endFree, el.startBinding!.gap);
    } else if (endT) {
      endWorld = attach(endT, startFree, el.endBinding!.gap);
    }

    if (dist(startWorld, startFree) < 0.01 && dist(endWorld, endFree) < 0.01) return el;
    mutated = true;
    return normalizePoints({
      ...el,
      x: startWorld.x,
      y: startWorld.y,
      points: [
        { x: 0, y: 0 },
        { x: endWorld.x - startWorld.x, y: endWorld.y - startWorld.y },
      ],
      updated: Date.now(),
    });
  });

  return mutated ? out : elements;
}

// Topmost element (excluding connectors / freehand) suitable as a binding target.
export function bindableAt(
  elements: Element[],
  world: Point,
  pad: number,
  excludeId?: string,
): Element | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.id === excludeId || el.hidden) continue;
    if (isConnector(el) || el.type === 'draw') continue;
    if (hitTest(el, world, pad)) return el;
  }
  return null;
}

// Remove bindings whose target no longer exists; drop the rest unchanged.
export function dropDanglingBindings(elements: Element[]): Element[] {
  const present = new Set(elements.map((e) => e.id));
  let mutated = false;
  const out = elements.map((el) => {
    if (!isConnector(el)) return el;
    let { startBinding, endBinding } = el;
    let changed = false;
    if (startBinding && !present.has(startBinding.elementId)) {
      startBinding = null;
      changed = true;
    }
    if (endBinding && !present.has(endBinding.elementId)) {
      endBinding = null;
      changed = true;
    }
    if (!changed) return el;
    mutated = true;
    return { ...el, startBinding, endBinding };
  });
  return mutated ? out : elements;
}
