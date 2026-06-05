'use client';

import { AlignBar } from '@/components/AlignBar';
import { Canvas } from '@/components/canvas/Canvas';
import { CommandPalette } from '@/components/CommandPalette';
import { ContextMenu, type MenuItem } from '@/components/ContextMenu';
import { ExportModal } from '@/components/ExportModal';
import { LayersPanel } from '@/components/LayersPanel';
import { Minimap } from '@/components/Minimap';
import { Present } from '@/components/Present';
import { SettingsModal } from '@/components/SettingsModal';
import { StylePanel } from '@/components/StylePanel';
import { Toolbar } from '@/components/Toolbar';
import { Topbar } from '@/components/Topbar';
import { ZoomControls } from '@/components/ZoomControls';
import { createBoard, duplicateBoard } from '@/lib/boards';
import { copyElements, hasClipboard, readClipboard } from '@/lib/clipboard';
import { useControls } from '@/lib/controls';
import { renderToCanvas } from '@/lib/export';
import { commonBounds, hitTest, screenToWorld } from '@/lib/geometry';
import { getSelectedElements, useEditor } from '@/lib/store';
import { getBoard, saveBoard } from '@/lib/storage';
import type { Element, Point, Tool } from '@/lib/types';
import { AnimatePresence } from 'framer-motion';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  Eye,
  Grid3x3,
  Group,
  Lock,
  Maximize,
  MousePointerClick,
  Trash2,
  Ungroup,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export function Editor({ boardId }: { boardId: string }) {
  const router = useRouter();
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [saved, setSaved] = useState(true);
  const hasElements = useEditor((s) => s.elements.length > 0);
  const editing = useEditor((s) => s.editingId !== null);
  const presenting = useEditor((s) => s.presenting);
  const canPresent = useEditor((s) => s.elements.some((e) => e.type === 'frame'));

  // ── autosave ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastThumb = 0;
    const save = async () => {
      const st = useEditor.getState();
      const existing = await getBoard(boardId);
      let thumbnail = existing?.thumbnail;
      if (Date.now() - lastThumb > 3500) {
        thumbnail = (await makeThumbnail(st.elements)) ?? thumbnail;
        lastThumb = Date.now();
      }
      await saveBoard({
        id: boardId,
        name: st.boardName,
        elements: st.elements,
        camera: st.camera,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        favorite: existing?.favorite ?? false,
        archived: existing?.archived ?? false,
        thumbnail,
      });
      setSaved(true);
    };
    const unsub = useEditor.subscribe((st, prev) => {
      if (st.elements === prev.elements && st.camera === prev.camera && st.boardName === prev.boardName) {
        return;
      }
      setSaved(false);
      clearTimeout(timer);
      timer = setTimeout(save, 700);
    });
    return () => {
      unsub();
      clearTimeout(timer);
      // best-effort flush on unmount
      void save();
    };
  }, [boardId]);

  // ── element clipboard helpers ────────────────────────────────────────────────
  const copy = useCallback(() => {
    const s = useEditor.getState();
    const sel = getSelectedElements(s);
    if (!sel.length) return;
    // copying a frame includes its children
    const ids = new Set(sel.map((e) => e.id));
    const withKids = [...sel];
    for (const e of s.elements) {
      if (e.frameId && ids.has(e.frameId) && !ids.has(e.id)) withKids.push(e);
    }
    copyElements(withKids);
  }, []);

  const pasteAt = useCallback((world?: Point) => {
    if (!hasClipboard()) return;
    let clones = readClipboard(world ? 0 : 24);
    if (world) {
      const b = commonBounds(clones);
      if (b) {
        const dx = world.x - (b.x + b.width / 2);
        const dy = world.y - (b.y + b.height / 2);
        clones = clones.map((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
      }
    }
    const s = useEditor.getState();
    const before = s.elements;
    s.setElements([...s.elements, ...clones]);
    if (s.elements.some((e) => e.type === 'frame')) {
      s.applyMembership(new Set(clones.map((c) => c.id)));
    }
    s.commit(before);
    s.setSelection(clones.map((c) => c.id));
  }, []);

  // ── board actions ─────────────────────────────────────────────────────────────
  const newBoard = useCallback(async () => {
    const b = await createBoard();
    router.push(`/board?id=${b.id}`);
  }, [router]);

  const duplicate = useCallback(async () => {
    const b = await duplicateBoard(boardId);
    if (b) router.push(`/board?id=${b.id}`);
  }, [boardId, router]);

  const openBoard = useCallback((id: string) => router.push(`/board?id=${id}`), [router]);

  // ── keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = document.activeElement;
      const typing =
        a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || (a as HTMLElement).isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      const s = useEditor.getState();
      const ctl = useControls.getState();

      if (s.presenting) return; // the slideshow owns all keys while presenting

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (typing) return;
      const overlay = exportOpen || settingsOpen || paletteOpen || !!ctx;
      if (overlay) return;

      if (mod) {
        const k = e.key.toLowerCase();
        if (k === 'z') {
          e.preventDefault();
          e.shiftKey ? s.redo() : s.undo();
        } else if (k === 'y') {
          e.preventDefault();
          s.redo();
        } else if (k === 'd') {
          e.preventDefault();
          s.duplicateSelected();
        } else if (k === 'a') {
          e.preventDefault();
          s.selectAll();
        } else if (k === 'c') {
          copy();
        } else if (k === 'x') {
          copy();
          s.deleteSelected();
        } else if (k === 'v') {
          pasteAt();
        } else if (k === 'g') {
          e.preventDefault();
          e.shiftKey ? s.ungroup() : s.group();
        } else if (k === '=' || k === '+') {
          e.preventDefault();
          ctl.zoomIn?.();
        } else if (k === '-') {
          e.preventDefault();
          ctl.zoomOut?.();
        } else if (k === '0') {
          e.preventDefault();
          ctl.setZoom?.(1);
        } else if (k === ']') {
          e.preventDefault();
          e.shiftKey ? s.bringToFront() : s.bringForward();
        } else if (k === '[') {
          e.preventDefault();
          e.shiftKey ? s.sendToBack() : s.sendBackward();
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        s.deleteSelected();
        return;
      }
      if (e.key === 'Escape') {
        if (s.editingId) s.setEditing(null);
        else s.clearSelection();
        return;
      }
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') s.nudgeSelected(-d, 0);
        else if (e.key === 'ArrowRight') s.nudgeSelected(d, 0);
        else if (e.key === 'ArrowUp') s.nudgeSelected(0, -d);
        else if (e.key === 'ArrowDown') s.nudgeSelected(0, d);
        return;
      }
      if (e.shiftKey && e.key === '1') {
        ctl.fitToContent?.();
        return;
      }
      if (e.shiftKey && e.key === '!') {
        ctl.fitToContent?.();
        return;
      }
      const map: Record<string, Tool> = {
        v: 'select',
        p: 'pen',
        r: 'rectangle',
        c: 'ellipse',
        d: 'diamond',
        g: 'triangle',
        a: 'arrow',
        l: 'line',
        t: 'text',
        n: 'sticky',
        f: 'frame',
        e: 'eraser',
      };
      const tool = map[e.key.toLowerCase()];
      if (tool) s.setTool(tool);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exportOpen, settingsOpen, paletteOpen, ctx, copy, pasteAt]);

  // ── context menu ─────────────────────────────────────────────────────────────
  const onContextMenu = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, a, [role="dialog"], .panel')) return;
    if (exportOpen || settingsOpen || paletteOpen) return;
    e.preventDefault();

    const s = useEditor.getState();
    const world = screenToWorld({ x: e.clientX, y: e.clientY }, s.camera);

    // right-click selects the element under the cursor if nothing relevant selected
    if (s.selectedIds.length === 0) {
      const pad = 8 / s.camera.zoom;
      for (let i = s.elements.length - 1; i >= 0; i--) {
        const el = s.elements[i];
        if (!el.hidden && !el.locked && hitTest(el, world, pad)) {
          s.setSelection([el.id]);
          break;
        }
      }
    }

    const st = useEditor.getState();
    const sel = st.selectedIds.length > 0;
    const selected = getSelectedElements(st);
    const grouped = selected.some((x) => x.groupId);
    const items: MenuItem[] = [];

    if (sel) {
      items.push({ label: 'Copy', icon: <Copy size={15} />, hint: '⌘C', onClick: copy });
      items.push({ label: 'Duplicate', icon: <Copy size={15} />, hint: '⌘D', onClick: () => st.duplicateSelected() });
      if (hasClipboard()) items.push({ label: 'Paste here', icon: <Clipboard size={15} />, onClick: () => pasteAt(world) });
      items.push({ separator: true });
      items.push({ label: 'Bring to front', icon: <ArrowUpToLine size={15} />, onClick: () => st.bringToFront() });
      items.push({ label: 'Bring forward', icon: <ChevronUp size={15} />, onClick: () => st.bringForward() });
      items.push({ label: 'Send backward', icon: <ChevronDown size={15} />, onClick: () => st.sendBackward() });
      items.push({ label: 'Send to back', icon: <ArrowDownToLine size={15} />, onClick: () => st.sendToBack() });
      items.push({ separator: true });
      if (selected.length > 1 && !grouped) items.push({ label: 'Group', icon: <Group size={15} />, hint: '⌘G', onClick: () => st.group() });
      if (grouped) items.push({ label: 'Ungroup', icon: <Ungroup size={15} />, hint: '⌘⇧G', onClick: () => st.ungroup() });
      items.push({ label: 'Lock', icon: <Lock size={15} />, onClick: () => st.toggleLockSelected() });
      items.push({ label: 'Hide', icon: <Eye size={15} />, onClick: () => st.toggleHiddenSelected() });
      items.push({ separator: true });
      items.push({ label: 'Delete', icon: <Trash2 size={15} />, hint: '⌫', danger: true, onClick: () => st.deleteSelected() });
    } else {
      if (hasClipboard()) items.push({ label: 'Paste here', icon: <Clipboard size={15} />, hint: '⌘V', onClick: () => pasteAt(world) });
      items.push({ label: 'Select all', icon: <MousePointerClick size={15} />, hint: '⌘A', onClick: () => st.selectAll() });
      items.push({ separator: true });
      items.push({ label: 'Fit to content', icon: <Maximize size={15} />, onClick: () => useControls.getState().fitToContent?.() });
      items.push({ label: st.grid ? 'Hide grid' : 'Show grid', icon: <Grid3x3 size={15} />, onClick: () => st.toggleGrid() });
    }

    setCtx({ x: e.clientX, y: e.clientY, items });
  };

  return (
    <div className="no-scroll bg-canvas dark:bg-[#0f0f10]" onContextMenu={onContextMenu}>
      <Canvas boardId={boardId} />

      {!hasElements && !editing && (
        <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm font-medium text-ink/35">Pick a tool and start drawing</p>
            <p className="mt-1 text-xs text-ink/25">Double-click anywhere to add text · ⌘K for commands</p>
          </div>
        </div>
      )}

      <Topbar
        saved={saved}
        onOpenExport={() => setExportOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
        onDuplicate={duplicate}
        onToggleLayers={() => setLayersOpen((o) => !o)}
        layersOpen={layersOpen}
        onPresent={() => useEditor.getState().startPresent()}
        canPresent={canPresent}
      />
      <Toolbar />
      <StylePanel />
      <AlignBar />
      <LayersPanel open={layersOpen} onClose={() => setLayersOpen(false)} />
      <Minimap />
      <ZoomControls />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenExport={() => setExportOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onNewBoard={newBoard}
        onDuplicate={duplicate}
        onOpenBoard={openBoard}
      />
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} onOpenBoard={openBoard} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <AnimatePresence>
        {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
      </AnimatePresence>

      {presenting && <Present />}
    </div>
  );
}

// Generate a small JPEG thumbnail (dataURL) for the dashboard.
async function makeThumbnail(elements: Element[]): Promise<string | undefined> {
  const visible = elements.filter((e) => !e.hidden);
  if (!visible.length) return undefined;
  try {
    const full = await renderToCanvas(visible, { scale: 1, padding: 24, background: '#ffffff' });
    const max = 360;
    const scale = Math.min(1, max / Math.max(full.width, full.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(full.width * scale));
    c.height = Math.max(1, Math.round(full.height * scale));
    const cx = c.getContext('2d')!;
    cx.drawImage(full, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.6);
  } catch {
    return undefined;
  }
}
