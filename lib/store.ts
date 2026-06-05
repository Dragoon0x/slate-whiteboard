import { create } from 'zustand';
import { alignElements, distributeElements, flipElements, type AlignAxis, type DistributeDir } from './arrange';
import { dropDanglingBindings, refreshConnectors } from './connectors';
import { HISTORY_LIMIT, MAX_ZOOM, MIN_ZOOM } from './constants';
import { normalizeFrameZOrder, reassignMembership } from './frames';
import { clamp } from './geometry';
import { setSetting } from './storage';
import type { BoardRecord, Camera, CanvasBg, CanvasBgStyle, Element, StyleDefaults, Tool } from './types';
import { DEFAULT_STYLE } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Editor store. All element mutations are immutable (new arrays + new objects)
// so undo/redo can store array references directly without deep cloning.
// ─────────────────────────────────────────────────────────────────────────────

interface EditorState {
  // Document
  boardId: string | null;
  boardName: string;
  elements: Element[];
  camera: Camera;

  // Interaction
  tool: Tool;
  lockTool: boolean;
  selectedIds: string[];
  editingId: string | null;
  hoveredId: string | null;

  // Style applied to new elements (and pushed onto the current selection)
  style: StyleDefaults;

  // Preferences
  grid: boolean;
  snap: boolean;
  autoShape: boolean; // convert rough pen sketches into clean shapes
  canvasBg: CanvasBg;

  // Presentation
  presenting: boolean;
  slideIndex: number;

  // History (arrays are immutable, so we keep references)
  past: Element[][];
  future: Element[][];

  // ── Actions ────────────────────────────────────────────────────────────────
  loadBoard: (record: BoardRecord) => void;
  resetDocument: () => void;

  setTool: (tool: Tool) => void;
  setLockTool: (v: boolean) => void;
  setCamera: (camera: Camera) => void;
  setName: (name: string) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  toggleAutoShape: () => void;
  setCanvasBg: (style: CanvasBgStyle) => void;

  // selection
  setSelection: (ids: string[]) => void;
  addToSelection: (ids: string[]) => void;
  toggleInSelection: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  setHovered: (id: string | null) => void;
  setEditing: (id: string | null) => void;

  // element mutation (no history)
  setElements: (els: Element[]) => void;
  // commit the pre-gesture snapshot to history if it differs from current
  commit: (prev: Element[]) => void;

  // element mutation (with history)
  addElement: (el: Element, opts?: { select?: boolean }) => void;
  updateElements: (ids: string[], patch: Partial<Element>, history?: boolean) => void;
  deleteElements: (ids: string[]) => void;
  deleteSelected: () => void;
  duplicateSelected: (offset?: number) => string[];
  nudgeSelected: (dx: number, dy: number, history?: boolean) => void;

  setStyle: (patch: Partial<StyleDefaults>) => void;
  // update the style defaults without touching the selection or history
  setStyleSilently: (patch: Partial<StyleDefaults>) => void;

  // z-order
  bringForward: () => void;
  sendBackward: () => void;
  bringToFront: () => void;
  sendToBack: () => void;
  reorderElements: (orderedIds: string[]) => void;
  applyMembership: (changedIds?: Set<string>) => void;
  alignSelected: (axis: AlignAxis) => void;
  distributeSelected: (dir: DistributeDir) => void;
  flipSelected: (dir: DistributeDir) => void;

  // presentation
  startPresent: () => void;
  exitPresent: () => void;
  setSlideIndex: (i: number) => void;

  // grouping & flags
  group: () => void;
  ungroup: () => void;
  toggleLockSelected: () => void;
  toggleHiddenSelected: () => void;

  undo: () => void;
  redo: () => void;
}

const INITIAL_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

function pushPast(state: EditorState): Element[][] {
  return [...state.past, state.elements].slice(-HISTORY_LIMIT);
}

// Remove unlocked targeted elements, release children of any deleted frame, and
// drop connector bindings that point at removed elements.
function removeElements(elements: Element[], idset: Set<string>): Element[] {
  const deletedFrames = new Set(
    elements.filter((e) => idset.has(e.id) && !e.locked && e.type === 'frame').map((e) => e.id),
  );
  let remaining = elements.filter((e) => !(idset.has(e.id) && !e.locked));
  if (deletedFrames.size) {
    remaining = remaining.map((e) =>
      e.frameId && deletedFrames.has(e.frameId) ? { ...e, frameId: null } : e,
    );
  }
  return dropDanglingBindings(remaining);
}

// Map style fields onto the element fields they control.
function styleToPatch(patch: Partial<StyleDefaults>): Partial<Element> {
  const p: Partial<Element> = {};
  if (patch.strokeColor !== undefined) p.strokeColor = patch.strokeColor;
  if (patch.backgroundColor !== undefined) p.backgroundColor = patch.backgroundColor;
  if (patch.fillStyle !== undefined) p.fillStyle = patch.fillStyle;
  if (patch.strokeWidth !== undefined) p.strokeWidth = patch.strokeWidth;
  if (patch.strokeStyle !== undefined) p.strokeStyle = patch.strokeStyle;
  if (patch.opacity !== undefined) p.opacity = patch.opacity;
  if (patch.roundness !== undefined) p.roundness = patch.roundness;
  if (patch.fontSize !== undefined) p.fontSize = patch.fontSize;
  if (patch.fontFamily !== undefined) p.fontFamily = patch.fontFamily;
  if (patch.textAlign !== undefined) p.textAlign = patch.textAlign;
  if (patch.fontWeight !== undefined) p.fontWeight = patch.fontWeight;
  if (patch.italic !== undefined) p.italic = patch.italic;
  if (patch.lineHeight !== undefined) p.lineHeight = patch.lineHeight;
  if (patch.letterSpacing !== undefined) p.letterSpacing = patch.letterSpacing;
  return p;
}

export const useEditor = create<EditorState>((set, get) => ({
  boardId: null,
  boardName: 'Untitled',
  elements: [],
  camera: INITIAL_CAMERA,

  tool: 'select',
  lockTool: false,
  selectedIds: [],
  editingId: null,
  hoveredId: null,

  style: { ...DEFAULT_STYLE },

  grid: false,
  snap: true,
  autoShape: false,
  canvasBg: { style: 'dots' },

  presenting: false,
  slideIndex: 0,

  past: [],
  future: [],

  loadBoard: (record) =>
    set({
      boardId: record.id,
      boardName: record.name,
      elements: refreshConnectors(record.elements ?? []),
      camera: record.camera ?? INITIAL_CAMERA,
      selectedIds: [],
      editingId: null,
      past: [],
      future: [],
    }),

  resetDocument: () =>
    set({
      boardId: null,
      boardName: 'Untitled',
      elements: [],
      camera: INITIAL_CAMERA,
      selectedIds: [],
      editingId: null,
      past: [],
      future: [],
    }),

  setTool: (tool) =>
    set((s) => ({
      tool,
      // leaving select mode drops the marquee selection's editing state
      editingId: null,
      selectedIds: tool === 'select' ? s.selectedIds : [],
    })),
  setLockTool: (v) => set({ lockTool: v }),
  setCamera: (camera) =>
    set({
      camera: {
        x: camera.x,
        y: camera.y,
        zoom: clamp(camera.zoom, MIN_ZOOM, MAX_ZOOM),
      },
    }),
  setName: (name) => set({ boardName: name }),
  toggleGrid: () => set((s) => ({ grid: !s.grid })),
  toggleSnap: () => set((s) => ({ snap: !s.snap })),
  toggleAutoShape: () => set((s) => ({ autoShape: !s.autoShape })),
  setCanvasBg: (style) => {
    set({ canvasBg: { style } });
    void setSetting('canvasBg', style);
  },

  setSelection: (ids) => set({ selectedIds: ids }),
  addToSelection: (ids) =>
    set((s) => ({ selectedIds: Array.from(new Set([...s.selectedIds, ...ids])) })),
  toggleInSelection: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id],
    })),
  clearSelection: () => set({ selectedIds: [], editingId: null }),
  selectAll: () =>
    set((s) => ({ selectedIds: s.elements.filter((e) => !e.locked && !e.hidden).map((e) => e.id) })),
  setHovered: (id) => set({ hoveredId: id }),
  setEditing: (id) => set({ editingId: id }),

  setElements: (els) => set({ elements: els }),
  commit: (prev) =>
    set((s) => {
      if (prev === s.elements) return {};
      return { past: [...s.past, prev].slice(-HISTORY_LIMIT), future: [] };
    }),

  addElement: (el, opts = { select: true }) =>
    set((s) => ({
      past: pushPast(s),
      future: [],
      elements: [...s.elements, el],
      selectedIds: opts.select ? [el.id] : s.selectedIds,
    })),

  updateElements: (ids, patch, history = true) =>
    set((s) => {
      const idset = new Set(ids);
      const mapped = s.elements.map((e) =>
        idset.has(e.id) ? { ...e, ...patch, updated: Date.now() } : e,
      );
      const elements = refreshConnectors(mapped, idset);
      return history
        ? { elements, past: pushPast(s), future: [] }
        : { elements };
    }),

  deleteElements: (ids) =>
    set((s) => {
      const idset = new Set(ids);
      return {
        past: pushPast(s),
        future: [],
        elements: removeElements(s.elements, idset),
        selectedIds: s.selectedIds.filter((id) => !idset.has(id)),
      };
    }),

  deleteSelected: () => {
    const { selectedIds } = get();
    if (selectedIds.length === 0) return;
    set((s) => {
      const idset = new Set(selectedIds);
      return {
        past: pushPast(s),
        future: [],
        elements: removeElements(s.elements, idset),
        selectedIds: [],
        editingId: null,
      };
    });
  },

  duplicateSelected: (offset = 24) => {
    const { selectedIds } = get();
    if (selectedIds.length === 0) return [];
    const newIds: string[] = [];
    set((s) => {
      const baseSet = new Set(selectedIds);
      // duplicating a frame carries its children
      const fullSet = new Set(baseSet);
      for (const e of s.elements) {
        if (e.frameId && baseSet.has(e.frameId)) fullSet.add(e.id);
      }
      const groupRemap = new Map<string, string>();
      const sel = s.elements.filter((e) => fullSet.has(e.id));
      const idRemap = new Map<string, string>();
      for (const e of sel) idRemap.set(e.id, cryptoId());
      const remapBind = (b: typeof sel[number]['startBinding']) =>
        b ? (idRemap.has(b.elementId) ? { ...b, elementId: idRemap.get(b.elementId)! } : null) : b;
      const clones = sel.map((e) => {
        const id = idRemap.get(e.id)!;
        if (baseSet.has(e.id)) newIds.push(id);
        let groupId = e.groupId ?? null;
        if (groupId) {
          if (!groupRemap.has(groupId)) groupRemap.set(groupId, cryptoId());
          groupId = groupRemap.get(groupId)!;
        }
        return {
          ...e,
          id,
          x: e.x + offset,
          y: e.y + offset,
          groupId,
          frameId: e.frameId && idRemap.has(e.frameId) ? idRemap.get(e.frameId)! : e.frameId ?? null,
          startBinding: remapBind(e.startBinding),
          endBinding: remapBind(e.endBinding),
          points: e.points ? e.points.map((p) => ({ ...p })) : undefined,
          updated: Date.now(),
        };
      });
      return {
        past: pushPast(s),
        future: [],
        elements: refreshConnectors([...s.elements, ...clones]),
        selectedIds: newIds,
      };
    });
    return newIds;
  },

  nudgeSelected: (dx, dy, history = true) => {
    const { selectedIds } = get();
    if (selectedIds.length === 0) return;
    set((s) => {
      const idset = new Set(selectedIds);
      const mapped = s.elements.map((e) =>
        idset.has(e.id) && !e.locked ? { ...e, x: e.x + dx, y: e.y + dy, updated: Date.now() } : e,
      );
      const elements = refreshConnectors(mapped, idset);
      return history ? { elements, past: pushPast(s), future: [] } : { elements };
    });
  },

  setStyle: (patch) =>
    set((s) => {
      const style = { ...s.style, ...patch };
      // Apply matching props to the current selection.
      if (s.selectedIds.length > 0) {
        const elPatch = styleToPatch(patch);
        // sticky color travels via backgroundColor for sticky elements
        const idset = new Set(s.selectedIds);
        const elements = s.elements.map((e) => {
          if (!idset.has(e.id) || e.locked) return e;
          const p = { ...elPatch };
          if (patch.stickyColor !== undefined && e.type === 'sticky') {
            p.backgroundColor = patch.stickyColor;
          }
          return Object.keys(p).length ? { ...e, ...p, updated: Date.now() } : e;
        });
        return { style, elements, past: pushPast(s), future: [] };
      }
      return { style };
    }),

  setStyleSilently: (patch) => set((s) => ({ style: { ...s.style, ...patch } })),

  bringForward: () => reorder(set, get, 'forward'),
  sendBackward: () => reorder(set, get, 'backward'),
  bringToFront: () => reorder(set, get, 'front'),
  sendToBack: () => reorder(set, get, 'back'),

  // Reorder by an explicit render-order id list (drives the layers panel).
  // Any element missing from the list is preserved at the bottom in its
  // original relative order so nothing can be dropped.
  reorderElements: (orderedIds) =>
    set((s) => {
      const byId = new Map(s.elements.map((e) => [e.id, e]));
      const seen = new Set(orderedIds);
      const ordered = orderedIds.map((id) => byId.get(id)).filter(Boolean) as Element[];
      const rest = s.elements.filter((e) => !seen.has(e.id));
      return { elements: [...rest, ...ordered], past: pushPast(s), future: [] };
    }),

  applyMembership: (changedIds) =>
    set((s) => ({ elements: normalizeFrameZOrder(reassignMembership(changedIds ?? null, s.elements)) })),

  alignSelected: (axis) =>
    set((s) => {
      if (s.selectedIds.length < 2) return {};
      const idset = new Set(s.selectedIds);
      const sel = s.elements.filter((e) => idset.has(e.id) && !e.locked);
      if (sel.length < 2) return {};
      const moved = new Map(alignElements(sel, axis).map((e) => [e.id, e]));
      const elements = refreshConnectors(s.elements.map((e) => moved.get(e.id) ?? e), new Set(moved.keys()));
      return { elements, past: pushPast(s), future: [] };
    }),
  distributeSelected: (dir) =>
    set((s) => {
      if (s.selectedIds.length < 3) return {};
      const idset = new Set(s.selectedIds);
      const sel = s.elements.filter((e) => idset.has(e.id) && !e.locked);
      if (sel.length < 3) return {};
      const moved = new Map(distributeElements(sel, dir).map((e) => [e.id, e]));
      const elements = refreshConnectors(s.elements.map((e) => moved.get(e.id) ?? e), new Set(moved.keys()));
      return { elements, past: pushPast(s), future: [] };
    }),
  flipSelected: (dir) =>
    set((s) => {
      const idset = new Set(s.selectedIds);
      const sel = s.elements.filter((e) => idset.has(e.id) && !e.locked);
      if (!sel.length) return {};
      const moved = new Map(flipElements(sel, dir).map((e) => [e.id, e]));
      const elements = refreshConnectors(s.elements.map((e) => moved.get(e.id) ?? e), new Set(moved.keys()));
      return { elements, past: pushPast(s), future: [] };
    }),

  startPresent: () => set((s) => ({ presenting: true, slideIndex: 0, editingId: null })),
  exitPresent: () => set({ presenting: false }),
  setSlideIndex: (i) => set({ slideIndex: i }),

  group: () => {
    const { selectedIds } = get();
    if (selectedIds.length < 2) return;
    const gid = cryptoId();
    set((s) => {
      const idset = new Set(selectedIds);
      return {
        past: pushPast(s),
        future: [],
        elements: s.elements.map((e) => (idset.has(e.id) ? { ...e, groupId: gid } : e)),
      };
    });
  },

  ungroup: () =>
    set((s) => {
      const idset = new Set(s.selectedIds);
      return {
        past: pushPast(s),
        future: [],
        elements: s.elements.map((e) => (idset.has(e.id) ? { ...e, groupId: null } : e)),
      };
    }),

  toggleLockSelected: () =>
    set((s) => {
      const idset = new Set(s.selectedIds);
      const anyUnlocked = s.elements.some((e) => idset.has(e.id) && !e.locked);
      return {
        past: pushPast(s),
        future: [],
        elements: s.elements.map((e) => (idset.has(e.id) ? { ...e, locked: anyUnlocked } : e)),
      };
    }),

  toggleHiddenSelected: () =>
    set((s) => {
      const idset = new Set(s.selectedIds);
      const anyVisible = s.elements.some((e) => idset.has(e.id) && !e.hidden);
      return {
        past: pushPast(s),
        future: [],
        elements: s.elements.map((e) => (idset.has(e.id) ? { ...e, hidden: anyVisible } : e)),
      };
    }),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return {};
      const prev = s.past[s.past.length - 1];
      const ids = new Set(prev.map((e) => e.id));
      return {
        elements: prev,
        past: s.past.slice(0, -1),
        future: [s.elements, ...s.future].slice(0, HISTORY_LIMIT),
        selectedIds: s.selectedIds.filter((id) => ids.has(id)),
        editingId: null,
      };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return {};
      const next = s.future[0];
      const ids = new Set(next.map((e) => e.id));
      return {
        elements: next,
        future: s.future.slice(1),
        past: [...s.past, s.elements].slice(-HISTORY_LIMIT),
        selectedIds: s.selectedIds.filter((id) => ids.has(id)),
        editingId: null,
      };
    }),
}));

// z-order helper shared by the four reorder actions
function reorder(
  set: (fn: (s: EditorState) => Partial<EditorState>) => void,
  get: () => EditorState,
  dir: 'forward' | 'backward' | 'front' | 'back',
) {
  const { selectedIds } = get();
  if (selectedIds.length === 0) return;
  set((s) => {
    const idset = new Set(selectedIds);
    let els = [...s.elements];
    if (dir === 'front') {
      const sel = els.filter((e) => idset.has(e.id));
      els = [...els.filter((e) => !idset.has(e.id)), ...sel];
    } else if (dir === 'back') {
      const sel = els.filter((e) => idset.has(e.id));
      els = [...sel, ...els.filter((e) => !idset.has(e.id))];
    } else if (dir === 'forward') {
      for (let i = els.length - 2; i >= 0; i--) {
        if (idset.has(els[i].id) && !idset.has(els[i + 1].id)) {
          [els[i], els[i + 1]] = [els[i + 1], els[i]];
        }
      }
    } else {
      for (let i = 1; i < els.length; i++) {
        if (idset.has(els[i].id) && !idset.has(els[i - 1].id)) {
          [els[i], els[i - 1]] = [els[i - 1], els[i]];
        }
      }
    }
    return { elements: els, past: pushPast(s), future: [] };
  });
}

// small local id (avoids a circular import surface with lib/id at module init)
function cryptoId(): string {
  const a = '0123456789abcdefghijklmnopqrstuvwxyz';
  let s = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const b = crypto.getRandomValues(new Uint8Array(12));
    for (let i = 0; i < 12; i++) s += a[b[i] % a.length];
  } else {
    for (let i = 0; i < 12; i++) s += a[Math.floor(Math.random() * a.length)];
  }
  return s;
}

// Derived helper (not a hook) for reading the current selection's elements.
export function getSelectedElements(state: EditorState): Element[] {
  const idset = new Set(state.selectedIds);
  return state.elements.filter((e) => idset.has(e.id));
}
