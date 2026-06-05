'use client';

import { useControls } from '@/lib/controls';
import { useEditor } from '@/lib/store';
import { listBoardMeta } from '@/lib/storage';
import { useTheme } from '@/lib/theme';
import type { BoardMeta } from '@/lib/types';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Copy,
  Download,
  FileText,
  Frame,
  Grid3x3,
  Magnet,
  Maximize,
  Moon,
  Pencil,
  Play,
  Plus,
  Redo2,
  Settings,
  Sparkles,
  Square,
  Sun,
  Type,
  Undo2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

interface Cmd {
  id: string;
  title: string;
  group: string;
  hint?: string;
  icon: React.ReactNode;
  keywords?: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onOpenExport,
  onOpenSettings,
  onNewBoard,
  onDuplicate,
  onOpenBoard,
}: {
  open: boolean;
  onClose: () => void;
  onOpenExport: () => void;
  onOpenSettings: () => void;
  onNewBoard: () => void;
  onDuplicate: () => void;
  onOpenBoard: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [boards, setBoards] = useState<BoardMeta[]>([]);
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
      listBoardMeta().then((b) => setBoards(b.filter((x) => !x.archived).slice(0, 8)));
    }
  }, [open]);

  const commands = useMemo<Cmd[]>(() => {
    const ed = useEditor.getState();
    const ctl = useControls.getState();
    const base: Cmd[] = [
      { id: 'new', title: 'New board', group: 'Board', icon: <Plus size={16} />, run: onNewBoard },
      { id: 'export', title: 'Export / Share…', group: 'Board', icon: <Download size={16} />, keywords: 'png svg pdf save download', run: onOpenExport },
      { id: 'dup', title: 'Duplicate board', group: 'Board', icon: <Copy size={16} />, run: onDuplicate },
      {
        id: 'present',
        title: 'Start presentation',
        group: 'Board',
        icon: <Play size={16} />,
        keywords: 'slideshow slides frames',
        run: () => ed.startPresent(),
      },
      { id: 'settings', title: 'Settings', group: 'Board', icon: <Settings size={16} />, run: onOpenSettings },
      { id: 'fit', title: 'Fit to content', group: 'View', icon: <Maximize size={16} />, run: () => ctl.fitToContent?.() },
      { id: 'reset', title: 'Reset zoom to 100%', group: 'View', icon: <Maximize size={16} />, run: () => ctl.setZoom?.(1) },
      {
        id: 'theme',
        title: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        group: 'View',
        icon: theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />,
        keywords: 'dark mode appearance',
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      { id: 'grid', title: ed.grid ? 'Hide grid' : 'Show grid', group: 'View', icon: <Grid3x3 size={16} />, run: () => ed.toggleGrid() },
      { id: 'snap', title: ed.snap ? 'Disable snapping' : 'Enable snapping', group: 'View', icon: <Magnet size={16} />, run: () => ed.toggleSnap() },
      { id: 'auto', title: ed.autoShape ? 'Disable auto shapes' : 'Enable auto shapes', group: 'View', icon: <Sparkles size={16} />, run: () => ed.toggleAutoShape() },
      { id: 'undo', title: 'Undo', group: 'Edit', icon: <Undo2 size={16} />, run: () => ed.undo() },
      { id: 'redo', title: 'Redo', group: 'Edit', icon: <Redo2 size={16} />, run: () => ed.redo() },
      { id: 't-select', title: 'Tool: Select', group: 'Tools', icon: <Square size={16} />, keywords: 'cursor', run: () => ed.setTool('select') },
      { id: 't-pen', title: 'Tool: Pen', group: 'Tools', icon: <Pencil size={16} />, keywords: 'draw', run: () => ed.setTool('pen') },
      { id: 't-rect', title: 'Tool: Rectangle', group: 'Tools', icon: <Square size={16} />, run: () => ed.setTool('rectangle') },
      { id: 't-frame', title: 'Tool: Frame', group: 'Tools', icon: <Frame size={16} />, keywords: 'artboard slide', run: () => ed.setTool('frame') },
      { id: 't-text', title: 'Tool: Text', group: 'Tools', icon: <Type size={16} />, run: () => ed.setTool('text') },
    ];
    const boardCmds: Cmd[] = boards.map((b) => ({
      id: `board-${b.id}`,
      title: b.name || 'Untitled',
      group: 'Switch to board',
      icon: <FileText size={16} />,
      keywords: 'open switch',
      run: () => onOpenBoard(b.id),
    }));
    return [...base, ...boardCmds];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards, open, theme]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.title} ${c.group} ${c.keywords ?? ''}`.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    const active = listRef.current?.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [index, filtered]);

  const run = (c?: Cmd) => {
    if (!c) return;
    onClose();
    // defer so the modal close doesn't swallow focus side-effects
    setTimeout(() => c.run(), 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(filtered[index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // group consecutive items for headers
  let lastGroup = '';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] dark:bg-black/50" onClick={onClose} />
          <motion.div
            className="panel relative w-full max-w-lg overflow-hidden p-0"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type a command or search boards…"
              className="w-full border-b border-black/[0.06] bg-transparent px-4 py-3.5 text-[15px] text-ink outline-none placeholder:text-ink/35 dark:border-white/10"
            />
            <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
              {filtered.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-ink/40">No matching commands</div>
              )}
              {filtered.map((c, i) => {
                const header = c.group !== lastGroup ? c.group : null;
                lastGroup = c.group;
                return (
                  <div key={c.id}>
                    {header && (
                      <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink/35">
                        {header}
                      </div>
                    )}
                    <button
                      data-active={i === index}
                      onMouseMove={() => setIndex(i)}
                      onClick={() => run(c)}
                      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                        i === index ? 'bg-accent text-white' : 'text-ink/80'
                      }`}
                    >
                      <span className={i === index ? 'text-white' : 'text-ink/50'}>{c.icon}</span>
                      <span className="flex-1 truncate text-left">{c.title}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
