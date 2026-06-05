import { DEFAULT_FRAME_BG, MAX_ZOOM, MIN_ZOOM } from './constants';
import { clamp, elementCenter } from './geometry';
import type { Bounds } from './geometry';
import { makeSeed, nanoid } from './id';
import type { Camera, Element, StyleDefaults } from './types';

export function createFrame(
  x: number,
  y: number,
  w: number,
  h: number,
  _style: StyleDefaults,
  name?: string,
): Element {
  return {
    id: nanoid(),
    type: 'frame',
    x,
    y,
    width: w,
    height: h,
    angle: 0,
    strokeColor: '#d4d4d8',
    backgroundColor: DEFAULT_FRAME_BG,
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    opacity: 100,
    roundness: 0,
    name,
    frameId: null,
    seed: makeSeed(),
    updated: Date.now(),
  };
}

export function childrenOf(frameId: string, els: Element[]): Element[] {
  return els.filter((e) => e.frameId === frameId);
}

// Topmost frame whose rectangle contains the element's center.
export function frameContaining(el: Element, els: Element[]): Element | null {
  const c = elementCenter(el);
  let found: Element | null = null;
  for (const f of els) {
    if (f.type !== 'frame' || f.id === el.id) continue;
    if (c.x >= f.x && c.x <= f.x + f.width && c.y >= f.y && c.y <= f.y + f.height) found = f;
  }
  return found;
}

// Update frameId for the changed elements based on geometric containment.
export function reassignMembership(changedIds: Set<string> | null, els: Element[]): Element[] {
  let mutated = false;
  const out = els.map((e) => {
    // frames can't nest; connectors stay loose so they're never clipped
    if (e.type === 'frame' || e.type === 'line' || e.type === 'arrow') return e;
    if (changedIds && !changedIds.has(e.id)) return e;
    const f = frameContaining(e, els);
    const next = f ? f.id : null;
    if ((e.frameId ?? null) === next) return e;
    mutated = true;
    return { ...e, frameId: next };
  });
  return mutated ? out : els;
}

// Reorder so each frame is immediately followed by its children — keeps array
// order equal to visual (clip) order while preserving overall stacking.
export function normalizeFrameZOrder(els: Element[]): Element[] {
  const frameIds = new Set(els.filter((e) => e.type === 'frame').map((e) => e.id));
  const childrenByFrame = new Map<string, Element[]>();
  for (const e of els) {
    if (e.frameId && frameIds.has(e.frameId)) {
      const arr = childrenByFrame.get(e.frameId);
      if (arr) arr.push(e);
      else childrenByFrame.set(e.frameId, [e]);
    }
  }
  const emitted = new Set<string>();
  const result: Element[] = [];
  const emitFrame = (f: Element) => {
    if (emitted.has(f.id)) return;
    result.push(f);
    emitted.add(f.id);
    for (const ch of childrenByFrame.get(f.id) ?? []) {
      if (!emitted.has(ch.id)) {
        result.push(ch);
        emitted.add(ch.id);
      }
    }
  };
  for (const e of els) {
    if (emitted.has(e.id)) continue;
    if (e.type === 'frame') {
      emitFrame(e);
    } else if (e.frameId && frameIds.has(e.frameId)) {
      const f = els.find((x) => x.id === e.frameId);
      if (f) emitFrame(f);
    } else {
      result.push(e);
      emitted.add(e.id);
    }
  }
  return result;
}

// Stable slide order for presentation: explicit frameOrder, then reading order.
export function sortFrames(els: Element[]): Element[] {
  return els
    .filter((e) => e.type === 'frame')
    .sort((a, b) => (a.frameOrder ?? 0) - (b.frameOrder ?? 0) || a.y - b.y || a.x - b.x);
}

export function hasFrames(els: Element[]): boolean {
  return els.some((e) => e.type === 'frame');
}

// Camera that fits `b` into a viewport with padding (shared by canvas + present).
export function cameraForBounds(
  b: Bounds,
  vw: number,
  vh: number,
  pad: number,
  maxZoom = MAX_ZOOM,
): Camera {
  const zoom = clamp(
    Math.min(vw / (b.width + pad * 2), vh / (b.height + pad * 2)),
    MIN_ZOOM,
    maxZoom,
  );
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  return { zoom, x: cx - vw / (2 * zoom), y: cy - vh / (2 * zoom) };
}
