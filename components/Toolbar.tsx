'use client';

import { useControls } from '@/lib/controls';
import { useEditor } from '@/lib/store';
import type { Tool } from '@/lib/types';
import {
  ArrowRight,
  Circle,
  Diamond,
  Eraser,
  Frame,
  Image as ImageIcon,
  Lock,
  LockOpen,
  Minus,
  MousePointer2,
  Pencil,
  Sparkles,
  Square,
  StickyNote,
  Triangle,
  Type,
} from 'lucide-react';

interface ToolDef {
  tool: Tool;
  icon: React.ReactNode;
  label: string;
  key: string;
}

const TOOLS: ToolDef[] = [
  { tool: 'select', icon: <MousePointer2 size={18} />, label: 'Select', key: 'V' },
  { tool: 'pen', icon: <Pencil size={18} />, label: 'Pen', key: 'P' },
  { tool: 'rectangle', icon: <Square size={18} />, label: 'Rectangle', key: 'R' },
  { tool: 'ellipse', icon: <Circle size={18} />, label: 'Ellipse', key: 'C' },
  { tool: 'diamond', icon: <Diamond size={18} />, label: 'Diamond', key: 'D' },
  { tool: 'triangle', icon: <Triangle size={18} />, label: 'Triangle', key: 'G' },
  { tool: 'arrow', icon: <ArrowRight size={18} />, label: 'Arrow', key: 'A' },
  { tool: 'line', icon: <Minus size={18} />, label: 'Line', key: 'L' },
  { tool: 'text', icon: <Type size={18} />, label: 'Text', key: 'T' },
  { tool: 'sticky', icon: <StickyNote size={18} />, label: 'Sticky note', key: 'N' },
  { tool: 'frame', icon: <Frame size={18} />, label: 'Frame', key: 'F' },
  { tool: 'eraser', icon: <Eraser size={18} />, label: 'Eraser', key: 'E' },
];

function ToolButton({
  active,
  onClick,
  label,
  hint,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <button className="tool-btn group" data-active={active} onClick={onClick} aria-label={label}>
      {children}
      <span className="pointer-events-none absolute -top-10 left-1/2 z-50 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-neutral-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-float transition-opacity group-hover:block group-hover:opacity-100 md:block dark:bg-neutral-700">
        {label}
        {hint && <span className="ml-1.5 text-white/50">{hint}</span>}
      </span>
    </button>
  );
}

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const lockTool = useEditor((s) => s.lockTool);
  const setLockTool = useEditor((s) => s.setLockTool);
  const autoShape = useEditor((s) => s.autoShape);
  const toggleAutoShape = useEditor((s) => s.toggleAutoShape);

  return (
    <div className="pointer-events-auto fixed bottom-4 left-1/2 z-30 max-w-[calc(100vw-1.5rem)] -translate-x-1/2">
      <div className="panel flex items-center gap-0.5 overflow-x-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TOOLS.map((t, i) => (
          <span key={t.tool} className="flex items-center">
            {(i === 2 || i === 8) && <span className="mx-1 h-6 w-px bg-black/[0.08] dark:bg-white/10" />}
            <ToolButton
              active={tool === t.tool}
              onClick={() => setTool(t.tool)}
              label={t.label}
              hint={t.key}
            >
              {t.icon}
            </ToolButton>
          </span>
        ))}

        <span className="mx-1 h-6 w-px bg-black/[0.08] dark:bg-white/10" />
        <ToolButton
          onClick={() => useControls.getState().pickImage?.()}
          label="Insert image"
        >
          <ImageIcon size={18} />
        </ToolButton>

        <span className="mx-1 h-6 w-px bg-black/[0.08] dark:bg-white/10" />
        <ToolButton
          active={autoShape}
          onClick={toggleAutoShape}
          label="Auto shapes"
          hint={autoShape ? 'on' : 'off'}
        >
          <Sparkles size={18} />
        </ToolButton>
        <ToolButton
          active={lockTool}
          onClick={() => setLockTool(!lockTool)}
          label="Keep tool active"
        >
          {lockTool ? <Lock size={17} /> : <LockOpen size={17} />}
        </ToolButton>
      </div>
    </div>
  );
}
