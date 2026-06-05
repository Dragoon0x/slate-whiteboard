'use client';

import type { BoardRecord } from '@/lib/types';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive,
  ArchiveRestore,
  Copy,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function BoardCard({
  board,
  onOpen,
  onRename,
  onDuplicate,
  onToggleFavorite,
  onArchive,
  onDelete,
}: {
  board: BoardRecord;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onToggleFavorite: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(board.name);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setName(board.name), [board.name]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  const commitRename = () => {
    setRenaming(false);
    const trimmed = name.trim() || 'Untitled';
    if (trimmed !== board.name) onRename(trimmed);
  };

  return (
    <div className="group relative">
      <button
        onClick={onOpen}
        className="block w-full overflow-hidden rounded-2xl border border-black/[0.07] bg-white text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-float dark:border-white/10 dark:bg-white/[0.04]"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-canvas dark:bg-black/20">
          {board.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={board.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-xs text-ink/25">Empty board</span>
            </div>
          )}
          {board.archived && (
            <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
              Archived
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') {
                    setName(board.name);
                    setRenaming(false);
                  }
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded-md bg-black/[0.04] px-1.5 py-0.5 text-sm font-medium text-ink outline-none ring-1 ring-accent/40 dark:bg-white/[0.08]"
              />
            ) : (
              <div className="truncate text-sm font-medium text-ink">{board.name || 'Untitled'}</div>
            )}
            <div className="mt-0.5 text-[11px] text-ink/40">{relativeTime(board.updatedAt)}</div>
          </div>
        </div>
      </button>

      {/* favorite toggle */}
      <button
        onClick={onToggleFavorite}
        className={`absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-white/80 backdrop-blur transition-all hover:bg-white dark:bg-black/40 dark:hover:bg-black/60 ${
          board.favorite ? 'text-amber-400 opacity-100' : 'text-ink/40 opacity-0 group-hover:opacity-100'
        }`}
        title={board.favorite ? 'Unfavorite' : 'Favorite'}
      >
        <Star size={16} fill={board.favorite ? 'currentColor' : 'none'} />
      </button>

      {/* overflow menu */}
      <div ref={menuRef} className="absolute bottom-2.5 right-2">
        <button
          onClick={() => setMenu((m) => !m)}
          className="grid h-8 w-8 place-items-center rounded-lg text-ink/45 opacity-0 transition-all hover:bg-black/[0.05] group-hover:opacity-100 dark:hover:bg-white/[0.06]"
          title="More"
        >
          <MoreHorizontal size={18} />
        </button>
        <AnimatePresence>
          {menu && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ duration: 0.13 }}
              className="panel absolute bottom-10 right-0 z-20 w-44 p-1.5"
            >
              <button className="menu-item" onClick={() => { setRenaming(true); setMenu(false); }}>
                <Pencil size={15} /> Rename
              </button>
              <button className="menu-item" onClick={() => { onDuplicate(); setMenu(false); }}>
                <Copy size={15} /> Duplicate
              </button>
              <button className="menu-item" onClick={() => { onArchive(); setMenu(false); }}>
                {board.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                {board.archived ? 'Unarchive' : 'Archive'}
              </button>
              <div className="my-1 h-px bg-black/[0.06] dark:bg-white/10" />
              <button
                className="menu-item text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                onClick={() => {
                  setMenu(false);
                  if (confirm(`Delete "${board.name}"? This cannot be undone.`)) onDelete();
                }}
              >
                <Trash2 size={15} /> Delete
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
