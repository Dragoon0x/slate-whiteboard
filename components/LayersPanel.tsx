'use client';

import { useEditor } from '@/lib/store';
import type { Element, ElementType } from '@/lib/types';
import {
  ArrowRight,
  Circle,
  Diamond,
  Eye,
  EyeOff,
  Frame,
  GripVertical,
  Image as ImageIcon,
  Lock,
  LockOpen,
  Minus,
  Pencil,
  Square,
  StickyNote,
  Triangle,
  Type,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

const ICONS: Record<ElementType, React.ReactNode> = {
  rectangle: <Square size={14} />,
  ellipse: <Circle size={14} />,
  diamond: <Diamond size={14} />,
  triangle: <Triangle size={14} />,
  line: <Minus size={14} />,
  arrow: <ArrowRight size={14} />,
  draw: <Pencil size={14} />,
  text: <Type size={14} />,
  sticky: <StickyNote size={14} />,
  image: <ImageIcon size={14} />,
  frame: <Frame size={14} />,
};

const LABELS: Record<ElementType, string> = {
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  diamond: 'Diamond',
  triangle: 'Triangle',
  line: 'Line',
  arrow: 'Arrow',
  draw: 'Drawing',
  text: 'Text',
  sticky: 'Sticky note',
  image: 'Image',
  frame: 'Frame',
};

function rowLabel(el: Element): string {
  if (el.name?.trim()) return el.name;
  if ((el.type === 'text' || el.type === 'sticky') && el.text?.trim()) {
    return el.text.split('\n')[0].slice(0, 24);
  }
  return LABELS[el.type];
}

export function LayersPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const elements = useEditor((s) => s.elements);
  const selectedIds = useEditor((s) => s.selectedIds);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const beforeRef = useRef<Element[] | null>(null);

  // top-of-stack first
  const rows = useMemo(() => [...elements].reverse(), [elements]);
  const selected = new Set(selectedIds);

  if (!open) return null;

  const onDrop = (target: number) => {
    if (dragIndex === null || dragIndex === target) {
      setDragIndex(null);
      return;
    }
    const next = [...rows];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(target, 0, moved);
    // rows are top-first; convert back to render order (bottom-first)
    useEditor.getState().reorderElements([...next].reverse().map((e) => e.id));
    setDragIndex(null);
  };

  return (
    <div className="pointer-events-auto fixed right-3 top-20 z-20 flex max-h-[calc(100vh-7rem)] w-60 flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white/90 shadow-panel backdrop-blur-xl dark:border-white/10 dark:bg-[#1c1c1f]/95">
      <div className="flex items-center justify-between border-b border-black/[0.05] px-3 py-2 dark:border-white/[0.07]">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Layers</span>
        <button className="text-xs text-ink/40 hover:text-ink" onClick={onClose} title="Close panel">
          Hide
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 [scrollbar-width:thin]">
        {rows.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-ink/35">No objects yet</div>
        )}
        {rows.map((el, i) => (
          <div
            key={el.id}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(i)}
            onClick={(e) => {
              if (e.shiftKey) useEditor.getState().toggleInSelection(el.id);
              else useEditor.getState().setSelection([el.id]);
            }}
            className={`group flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm transition-colors ${
              selected.has(el.id) ? 'bg-accent/10 dark:bg-accent/20' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
            } ${el.hidden ? 'opacity-50' : ''}`}
          >
            <GripVertical size={13} className="shrink-0 cursor-grab text-ink/25" />
            <span className="shrink-0 text-ink/50">{ICONS[el.type]}</span>
            <input
              value={el.name ?? ''}
              placeholder={rowLabel(el)}
              onFocus={() => {
                beforeRef.current = useEditor.getState().elements;
              }}
              onChange={(e) => useEditor.getState().updateElements([el.id], { name: e.target.value }, false)}
              onBlur={() => {
                if (beforeRef.current) useEditor.getState().commit(beforeRef.current);
                beforeRef.current = null;
              }}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 truncate bg-transparent text-ink/80 outline-none placeholder:text-ink/55"
            />
            <button
              className="shrink-0 text-ink/35 opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
              title={el.hidden ? 'Show' : 'Hide'}
              onClick={(e) => {
                e.stopPropagation();
                useEditor.getState().updateElements([el.id], { hidden: !el.hidden });
              }}
              style={el.hidden ? { opacity: 1 } : undefined}
            >
              {el.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              className="shrink-0 text-ink/35 opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
              title={el.locked ? 'Unlock' : 'Lock'}
              onClick={(e) => {
                e.stopPropagation();
                useEditor.getState().updateElements([el.id], { locked: !el.locked });
              }}
              style={el.locked ? { opacity: 1 } : undefined}
            >
              {el.locked ? <Lock size={14} /> : <LockOpen size={14} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
