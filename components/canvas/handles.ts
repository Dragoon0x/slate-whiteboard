import { HANDLE_SIZE, ROTATE_HANDLE_OFFSET } from '@/lib/constants';
import { commonBounds, elementCenter, rotatePoint, worldToScreen } from '@/lib/geometry';
import type { Camera, Element, Point } from '@/lib/types';

export type HandleType =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'rotate';

export interface Handle {
  type: HandleType;
  x: number; // screen
  y: number; // screen
}

export interface SelectionFrame {
  corners: Point[]; // [nw, ne, se, sw] in screen coords
  handles: Handle[];
  angle: number; // box orientation (single element only; 0 for multi)
}

const CORNER_CURSORS: Record<string, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  rotate: 'grab',
};

export function cursorForHandle(type: HandleType): string {
  return CORNER_CURSORS[type] ?? 'default';
}

function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// Compute the selection frame for the given (already-selected) elements.
export function getSelectionFrame(elements: Element[], camera: Camera): SelectionFrame | null {
  if (elements.length === 0) return null;

  let cornersWorld: Point[];
  let angle = 0;

  if (elements.length === 1) {
    const el = elements[0];
    angle = el.angle;
    const c = elementCenter(el);
    cornersWorld = [
      { x: el.x, y: el.y },
      { x: el.x + el.width, y: el.y },
      { x: el.x + el.width, y: el.y + el.height },
      { x: el.x, y: el.y + el.height },
    ].map((p) => rotatePoint(p, c, el.angle));
  } else {
    const b = commonBounds(elements);
    if (!b) return null;
    cornersWorld = [
      { x: b.x, y: b.y },
      { x: b.x + b.width, y: b.y },
      { x: b.x + b.width, y: b.y + b.height },
      { x: b.x, y: b.y + b.height },
    ];
  }

  const corners = cornersWorld.map((p) => worldToScreen(p, camera));
  const [nw, ne, se, sw] = corners;
  const center = { x: (nw.x + se.x) / 2, y: (nw.y + se.y) / 2 };

  const nMid = mid(nw, ne);
  // outward (away from center) along the top edge normal
  let ux = nMid.x - center.x;
  let uy = nMid.y - center.y;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len;
  uy /= len;
  const rotate: Handle = {
    type: 'rotate',
    x: nMid.x + ux * ROTATE_HANDLE_OFFSET,
    y: nMid.y + uy * ROTATE_HANDLE_OFFSET,
  };

  const handles: Handle[] = [
    { type: 'nw', ...nw },
    { type: 'ne', ...ne },
    { type: 'se', ...se },
    { type: 'sw', ...sw },
    { type: 'n', ...nMid },
    { type: 'e', ...mid(ne, se) },
    { type: 's', ...mid(se, sw) },
    { type: 'w', ...mid(sw, nw) },
  ];
  // frames must stay axis-aligned (their clip assumes angle 0)
  if (!elements.some((e) => e.type === 'frame')) handles.push(rotate);

  return { corners, handles, angle };
}

// Hit-test the pointer (screen coords) against the frame's handles.
export function handleAtPoint(frame: SelectionFrame, screen: Point): Handle | null {
  const r = HANDLE_SIZE + 4;
  for (const h of frame.handles) {
    if (Math.abs(screen.x - h.x) <= r && Math.abs(screen.y - h.y) <= r) return h;
  }
  return null;
}
