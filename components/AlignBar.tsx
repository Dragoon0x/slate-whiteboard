'use client';

import { useEditor } from '@/lib/store';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  FlipHorizontal2,
  FlipVertical2,
} from 'lucide-react';

function Btn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="tool-btn !h-8 !w-8" title={title} onClick={onClick}>
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-black/[0.08] dark:bg-white/10" />;
}

export function AlignBar() {
  const count = useEditor((s) => s.selectedIds.length);
  const editing = useEditor((s) => s.editingId !== null);
  const presenting = useEditor((s) => s.presenting);
  const s = useEditor.getState;

  if (count < 1 || editing || presenting) return null;

  return (
    <div className="panel pointer-events-auto fixed left-1/2 top-[4.5rem] z-20 flex -translate-x-1/2 items-center gap-0.5 p-1">
      {count >= 2 && (
        <>
          <Btn title="Align left" onClick={() => s().alignSelected('left')}>
            <AlignStartVertical size={16} />
          </Btn>
          <Btn title="Align center" onClick={() => s().alignSelected('centerX')}>
            <AlignCenterVertical size={16} />
          </Btn>
          <Btn title="Align right" onClick={() => s().alignSelected('right')}>
            <AlignEndVertical size={16} />
          </Btn>
          <Divider />
          <Btn title="Align top" onClick={() => s().alignSelected('top')}>
            <AlignStartHorizontal size={16} />
          </Btn>
          <Btn title="Align middle" onClick={() => s().alignSelected('centerY')}>
            <AlignCenterHorizontal size={16} />
          </Btn>
          <Btn title="Align bottom" onClick={() => s().alignSelected('bottom')}>
            <AlignEndHorizontal size={16} />
          </Btn>
        </>
      )}
      {count >= 3 && (
        <>
          <Divider />
          <Btn title="Distribute horizontally" onClick={() => s().distributeSelected('horizontal')}>
            <AlignHorizontalSpaceAround size={16} />
          </Btn>
          <Btn title="Distribute vertically" onClick={() => s().distributeSelected('vertical')}>
            <AlignVerticalSpaceAround size={16} />
          </Btn>
        </>
      )}
      {count >= 2 && <Divider />}
      <Btn title="Flip horizontal" onClick={() => s().flipSelected('horizontal')}>
        <FlipHorizontal2 size={16} />
      </Btn>
      <Btn title="Flip vertical" onClick={() => s().flipSelected('vertical')}>
        <FlipVertical2 size={16} />
      </Btn>
    </div>
  );
}
