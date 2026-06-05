'use client';

import { Editor } from '@/components/Editor';
import { createBoard } from '@/lib/boards';
import { useEditor } from '@/lib/store';
import { getBoard } from '@/lib/storage';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function Loader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas dark:bg-[#0f0f10]">
      <div className="flex items-center gap-3 text-ink/40">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-white">
          <span className="h-3 w-3 animate-pulse rounded-[4px] bg-white" />
        </div>
        <span className="text-sm">Loading board…</span>
      </div>
    </div>
  );
}

function BoardRoute() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('id');
  const [ready, setReady] = useState<string | null>(null);
  const loadBoard = useEditor((s) => s.loadBoard);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) {
        // landed without a board — spin up a fresh one so users can draw immediately
        const b = await createBoard();
        if (!cancelled) router.replace(`/board?id=${b.id}`);
        return;
      }
      const record = await getBoard(id);
      if (cancelled) return;
      if (!record) {
        router.replace('/');
        return;
      }
      loadBoard(record);
      setReady(id);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, loadBoard, router]);

  if (!id || ready !== id) return <Loader />;
  return <Editor key={id} boardId={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <BoardRoute />
    </Suspense>
  );
}
