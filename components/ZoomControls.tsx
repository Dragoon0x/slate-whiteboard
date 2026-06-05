'use client';

import { useControls } from '@/lib/controls';
import { useEditor } from '@/lib/store';
import { Maximize, Minus, Plus } from 'lucide-react';

export function ZoomControls() {
  const zoom = useEditor((s) => s.camera.zoom);
  const controls = useControls();

  return (
    <div className="panel pointer-events-auto fixed bottom-4 left-3 z-20 flex items-center p-1">
      <button className="tool-btn" onClick={() => controls.zoomOut?.()} title="Zoom out (⌘−)">
        <Minus size={16} />
      </button>
      <button
        className="min-w-[3.25rem] rounded-lg px-1 py-1 text-center text-xs font-medium tabular-nums text-ink/70 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
        onClick={() => controls.setZoom?.(1)}
        title="Reset to 100%"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button className="tool-btn" onClick={() => controls.zoomIn?.()} title="Zoom in (⌘+)">
        <Plus size={16} />
      </button>
      <div className="mx-0.5 h-6 w-px bg-black/[0.08] dark:bg-white/10" />
      <button className="tool-btn" onClick={() => controls.fitToContent?.()} title="Fit to content (⇧1)">
        <Maximize size={15} />
      </button>
    </div>
  );
}
