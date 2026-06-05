import { nanoid } from './id';
import type { Element } from './types';

// In-memory clipboard for elements (copy/cut/paste within the app).
let buffer: Element[] = [];

export function copyElements(els: Element[]) {
  buffer = els.map((e) => ({ ...e, points: e.points?.map((p) => ({ ...p })) }));
}

export function hasClipboard(): boolean {
  return buffer.length > 0;
}

// Return fresh clones with new ids (group ids + connector bindings remapped to
// the clones; bindings to elements outside the copied set are dropped), offset
// for visibility.
export function readClipboard(offset = 24): Element[] {
  const groupRemap = new Map<string, string>();
  const idRemap = new Map<string, string>();
  for (const e of buffer) idRemap.set(e.id, nanoid());
  const remapBind = (b: Element['startBinding']) =>
    b ? (idRemap.has(b.elementId) ? { ...b, elementId: idRemap.get(b.elementId)! } : null) : b;

  return buffer.map((e) => {
    let groupId = e.groupId ?? null;
    if (groupId) {
      if (!groupRemap.has(groupId)) groupRemap.set(groupId, nanoid());
      groupId = groupRemap.get(groupId)!;
    }
    return {
      ...e,
      id: idRemap.get(e.id)!,
      x: e.x + offset,
      y: e.y + offset,
      groupId,
      frameId: e.frameId && idRemap.has(e.frameId) ? idRemap.get(e.frameId)! : e.frameId ?? null,
      startBinding: remapBind(e.startBinding),
      endBinding: remapBind(e.endBinding),
      points: e.points?.map((p) => ({ ...p })),
      updated: Date.now(),
    };
  });
}
