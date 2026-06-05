'use client';

import { BoardCard } from '@/components/Home/BoardCard';
import {
  createBoard,
  createFromTemplate,
  duplicateBoard,
  removeBoard,
  renameBoard,
  setArchived,
  toggleFavorite,
} from '@/lib/boards';
import { importBoardFile } from '@/lib/export';
import { getAllBoards } from '@/lib/storage';
import { TEMPLATES } from '@/lib/templates';
import type { BoardRecord } from '@/lib/types';
import {
  Columns3,
  GitBranch,
  LayoutTemplate,
  Map as MapIcon,
  Plus,
  Route,
  Search,
  Upload,
  Workflow,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  blank: <Plus size={18} />,
  flowchart: <Workflow size={18} />,
  mindmap: <GitBranch size={18} />,
  kanban: <Columns3 size={18} />,
  journey: <Route size={18} />,
  roadmap: <MapIcon size={18} />,
};

type Filter = 'recent' | 'favorites' | 'archived';

export function HomeScreen() {
  const router = useRouter();
  const [boards, setBoards] = useState<BoardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('recent');
  const importRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    setBoards(await getAllBoards());
    setLoading(false);
  };
  useEffect(() => {
    reload();
  }, []);

  const open = (id: string) => router.push(`/board?id=${id}`);

  const onNew = async () => {
    const b = await createBoard();
    open(b.id);
  };
  const onTemplate = async (id: string) => {
    const b = await createFromTemplate(id);
    open(b.id);
  };
  const onImport = async (file: File) => {
    try {
      const id = await importBoardFile(file);
      open(id);
    } catch {
      alert('Could not import that file. Make sure it is a Slate .board file.');
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = boards;
    if (q) {
      list = boards.filter((b) => {
        if ((b.name || '').toLowerCase().includes(q)) return true;
        return b.elements.some((e) => (e.text ?? '').toLowerCase().includes(q));
      });
    }
    if (filter === 'favorites') return list.filter((b) => b.favorite && !b.archived);
    if (filter === 'archived') return list.filter((b) => b.archived);
    return list.filter((b) => !b.archived);
  }, [boards, query, filter]);

  const counts = useMemo(
    () => ({
      recent: boards.filter((b) => !b.archived).length,
      favorites: boards.filter((b) => b.favorite && !b.archived).length,
      archived: boards.filter((b) => b.archived).length,
    }),
    [boards],
  );

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        {/* header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-white shadow-soft">
              <span className="h-3.5 w-3.5 rounded-[5px] bg-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink">Slate</h1>
              <p className="text-[13px] text-ink/45">Local-first whiteboard · works offline</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search boards & text…"
                className="h-10 w-44 rounded-xl border border-black/[0.07] bg-white pl-9 pr-3 text-sm text-ink outline-none transition-all focus:w-56 focus:border-accent/40 dark:border-white/10 dark:bg-white/[0.04] sm:w-52"
              />
            </div>
            <button className="btn h-10 border border-black/[0.07] bg-white dark:border-white/10 dark:bg-white/[0.04]" onClick={() => importRef.current?.click()}>
              <Upload size={16} /> <span className="hidden sm:inline">Import</span>
            </button>
            <button className="btn-primary h-10" onClick={onNew}>
              <Plus size={17} /> New board
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".board,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImport(f);
                e.target.value = '';
              }}
            />
          </div>
        </header>

        {/* templates */}
        <section className="mt-10">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink/40">
            Start from a template
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => onTemplate(t.id)}
                className="flex min-w-[150px] flex-1 flex-col items-start gap-2 rounded-2xl border border-black/[0.07] bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-float dark:border-white/10 dark:bg-white/[0.04]"
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-accent">
                  {TEMPLATE_ICONS[t.id] ?? <LayoutTemplate size={18} />}
                </span>
                <span className="mt-1 text-sm font-semibold text-ink">{t.name}</span>
                <span className="text-[11px] leading-snug text-ink/45">{t.description}</span>
              </button>
            ))}
          </div>
        </section>

        {/* filter tabs */}
        <section className="mt-10">
          <div className="mb-4 flex items-center gap-1 border-b border-black/[0.06] dark:border-white/10">
            {(['recent', 'favorites', 'archived'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`relative -mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize transition-colors ${
                  filter === f ? 'border-accent text-ink' : 'border-transparent text-ink/45 hover:text-ink/70'
                }`}
              >
                {f}
                <span className="ml-1.5 text-xs text-ink/30">{counts[f]}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-black/[0.04] dark:bg-white/[0.05]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState filter={filter} query={query} onNew={onNew} />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((b) => (
                <BoardCard
                  key={b.id}
                  board={b}
                  onOpen={() => open(b.id)}
                  onRename={async (name) => {
                    await renameBoard(b.id, name);
                    reload();
                  }}
                  onDuplicate={async () => {
                    await duplicateBoard(b.id);
                    reload();
                  }}
                  onToggleFavorite={async () => {
                    await toggleFavorite(b.id);
                    reload();
                  }}
                  onArchive={async () => {
                    await setArchived(b.id, !b.archived);
                    reload();
                  }}
                  onDelete={async () => {
                    await removeBoard(b.id);
                    reload();
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <footer className="mt-16 text-center text-xs text-ink/30">
          No account · No cloud · Everything saved locally on this device
        </footer>
      </div>
    </div>
  );
}

function EmptyState({ filter, query, onNew }: { filter: Filter; query: string; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/10 py-16 text-center dark:border-white/10">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-black/[0.04] text-ink/30 dark:bg-white/[0.05]">
        <LayoutTemplate size={22} />
      </div>
      <p className="mt-3 text-sm font-medium text-ink/60">
        {query ? 'No boards match your search' : filter === 'archived' ? 'No archived boards' : filter === 'favorites' ? 'No favorites yet' : 'No boards yet'}
      </p>
      {!query && filter === 'recent' && (
        <button className="btn-primary mt-4" onClick={onNew}>
          <Plus size={16} /> Create your first board
        </button>
      )}
    </div>
  );
}
