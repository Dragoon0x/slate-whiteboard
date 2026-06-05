'use client';

import { Modal } from '@/components/ui/Modal';
import { useEditor } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import type { CanvasBgStyle, Theme } from '@/lib/types';

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-black/[0.04] p-0.5 dark:bg-white/[0.06]">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`h-8 flex-1 rounded-md text-sm transition-all ${
            value === o.value
              ? 'bg-white text-ink shadow-soft dark:bg-white/10'
              : 'text-ink/55 hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className="flex w-full items-center justify-between gap-4 rounded-xl px-1 py-2.5 text-left"
    >
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink/45">{description}</span>
      </span>
      <span
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-black/15 dark:bg-white/15'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

const SHORTCUTS: [string, string][] = [
  ['V', 'Select'],
  ['P', 'Pen'],
  ['R', 'Rectangle'],
  ['C', 'Ellipse'],
  ['A', 'Arrow'],
  ['L', 'Line'],
  ['T', 'Text'],
  ['N', 'Sticky note'],
  ['F', 'Frame'],
  ['E', 'Eraser'],
  ['Space', 'Pan'],
  ['⌘ G', 'Group'],
  ['⌘ Z', 'Undo'],
  ['⌘ ⇧ Z', 'Redo'],
  ['⌘ D', 'Duplicate'],
  ['⌘ K', 'Command palette'],
  ['⌫', 'Delete'],
];

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const grid = useEditor((s) => s.grid);
  const snap = useEditor((s) => s.snap);
  const autoShape = useEditor((s) => s.autoShape);
  const canvasBg = useEditor((s) => s.canvasBg.style);
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);

  const clearBoard = () => {
    if (!confirm('Clear all objects from this board? This can be undone with ⌘Z.')) return;
    const s = useEditor.getState();
    const before = s.elements;
    s.setElements([]);
    s.commit(before);
    s.clearSelection();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Settings" className="max-w-md">
      <div className="-mt-1 divide-y divide-black/[0.05] dark:divide-white/[0.08]">
        <div className="py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink/40">
            Appearance
          </div>
          <Seg<Theme>
            value={theme}
            onChange={(t) => setTheme(t)}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
          />
          <div className="mt-2">
            <Seg<CanvasBgStyle>
              value={canvasBg}
              onChange={(s) => {
                useEditor.getState().setCanvasBg(s);
                if (!useEditor.getState().grid) useEditor.getState().toggleGrid();
              }}
              options={[
                { value: 'dots', label: 'Dots' },
                { value: 'grid', label: 'Grid' },
                { value: 'lines', label: 'Lines' },
                { value: 'solid', label: 'Plain' },
              ]}
            />
          </div>
        </div>

        <div className="py-1">
          <Toggle
            label="Show canvas pattern"
            description="Toggle the background dots / grid / lines"
            checked={grid}
            onChange={() => useEditor.getState().toggleGrid()}
          />
          <Toggle
            label="Snapping & guides"
            description="Snap to objects, edges and centers while moving"
            checked={snap}
            onChange={() => useEditor.getState().toggleSnap()}
          />
          <Toggle
            label="Auto shapes"
            description="Convert rough pen sketches into clean shapes"
            checked={autoShape}
            onChange={() => useEditor.getState().toggleAutoShape()}
          />
        </div>

        <div className="py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink/40">
            Keyboard shortcuts
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {SHORTCUTS.map(([k, a]) => (
              <div key={a} className="flex items-center justify-between text-sm">
                <span className="text-ink/65">{a}</span>
                <span className="kbd">{k}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink/40">
            Storage
          </div>
          <p className="text-xs leading-relaxed text-ink/50">
            Slate is local-first. Boards, images and preferences live in your browser&apos;s IndexedDB —
            nothing is uploaded to a server. Export a <span className="font-medium text-ink/70">.board</span> file
            to back up or move work between devices.
          </p>
          <button
            onClick={clearBoard}
            className="mt-3 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
          >
            Clear this board
          </button>
        </div>
      </div>
    </Modal>
  );
}
