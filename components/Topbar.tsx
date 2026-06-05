'use client';

import { useEditor } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  Copy,
  Download,
  Grid3x3,
  Home,
  Layers,
  Moon,
  MoreHorizontal,
  Play,
  Redo2,
  Search,
  Settings,
  Sun,
  Undo2,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export function Topbar({
  saved,
  onOpenExport,
  onOpenSettings,
  onOpenPalette,
  onDuplicate,
  onToggleLayers,
  layersOpen,
  onPresent,
  canPresent,
}: {
  saved: boolean;
  onOpenExport: () => void;
  onOpenSettings: () => void;
  onOpenPalette: () => void;
  onDuplicate: () => void;
  onToggleLayers?: () => void;
  layersOpen?: boolean;
  onPresent?: () => void;
  canPresent?: boolean;
}) {
  const name = useEditor((s) => s.boardName);
  const setName = useEditor((s) => s.setName);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const grid = useEditor((s) => s.grid);
  const toggleGrid = useEditor((s) => s.toggleGrid);
  const resolved = useTheme((s) => s.resolved);
  const setTheme = useTheme((s) => s.setTheme);

  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between p-3">
      {/* left cluster */}
      <div className="panel pointer-events-auto flex items-center gap-1 py-1.5 pl-1.5 pr-2.5">
        <Link
          href="/"
          className="grid h-8 w-8 place-items-center rounded-lg text-ink/70 transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
          aria-label="Home"
          title="Home"
        >
          <Home size={17} />
        </Link>
        <div className="mx-0.5 h-6 w-px bg-black/[0.08] dark:bg-white/10" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          spellCheck={false}
          className="w-24 rounded-md bg-transparent px-1.5 py-1 text-sm font-medium text-ink outline-none focus:bg-black/[0.04] dark:focus:bg-white/[0.06] sm:w-44"
          aria-label="Board name"
        />
        <span
          className="ml-0.5 flex items-center gap-1 text-[11px] text-ink/35"
          title={saved ? 'All changes saved locally' : 'Saving…'}
        >
          {saved ? <Check size={13} className="text-green-500/70" /> : (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          )}
          <span className="hidden sm:inline">{saved ? 'Saved' : 'Saving'}</span>
        </span>
      </div>

      {/* right cluster */}
      <div className="panel pointer-events-auto flex items-center gap-0.5 p-1.5">
        <button className="tool-btn" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">
          <Undo2 size={17} />
        </button>
        <button className="tool-btn" onClick={redo} disabled={!canRedo} title="Redo (⌘⇧Z)">
          <Redo2 size={17} />
        </button>
        <div className="mx-0.5 h-6 w-px bg-black/[0.08] dark:bg-white/10" />
        {onToggleLayers && (
          <button
            className="tool-btn hidden sm:grid"
            data-active={layersOpen}
            onClick={onToggleLayers}
            title="Layers"
          >
            <Layers size={17} />
          </button>
        )}
        <button
          className="tool-btn"
          onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
          title={resolved === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {resolved === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button className="tool-btn hidden sm:grid" onClick={onOpenPalette} title="Command palette (⌘K)">
          <Search size={17} />
        </button>
        {onPresent && (
          <button
            className="tool-btn hidden sm:grid"
            onClick={onPresent}
            disabled={!canPresent}
            title="Present"
          >
            <Play size={17} />
          </button>
        )}
        <button className="btn-primary ml-1 hidden h-9 sm:inline-flex" onClick={onOpenExport}>
          <Download size={16} /> Share
        </button>
        <button className="tool-btn sm:hidden" onClick={onOpenExport} title="Share / export">
          <Download size={17} />
        </button>

        <div className="relative" ref={menuRef}>
          <button className="tool-btn" onClick={() => setMenu((m) => !m)} title="More">
            <MoreHorizontal size={18} />
          </button>
          <AnimatePresence>
            {menu && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.14 }}
                className="panel absolute right-0 top-11 w-52 p-1.5"
              >
                <button className="menu-item" onClick={() => { onOpenExport(); setMenu(false); }}>
                  <Download size={16} /> Export…
                </button>
                <button className="menu-item" onClick={() => { onDuplicate(); setMenu(false); }}>
                  <Copy size={16} /> Duplicate board
                </button>
                <button className="menu-item" onClick={() => { toggleGrid(); setMenu(false); }}>
                  <Grid3x3 size={16} /> {grid ? 'Hide grid' : 'Show grid'}
                </button>
                <div className="my-1 h-px bg-black/[0.06] dark:bg-white/10" />
                <button className="menu-item" onClick={() => { onOpenSettings(); setMenu(false); }}>
                  <Settings size={16} /> Settings
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
