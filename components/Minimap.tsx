'use client';

import { ACCENT, THEME } from '@/lib/constants';
import { useControls } from '@/lib/controls';
import { commonBounds, elementAABB, screenToWorld } from '@/lib/geometry';
import { useEditor } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import type { Bounds } from '@/lib/geometry';
import { Map as MapIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const W = 188;
const H = 124;

export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  // mapping from world → mini, stashed for pointer inversion
  const mapRef = useRef({ x: 0, y: 0, scale: 1, ox: 0, oy: 0 });
  const draggingRef = useRef(false);
  const [open, setOpen] = useState(true);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    const s = useEditor.getState();
    const theme = THEME[useTheme.getState().resolved];
    const visible = s.elements.filter((e) => !e.hidden);

    // viewport rect in world coords (the editor canvas is full-bleed)
    const tl = screenToWorld({ x: 0, y: 0 }, s.camera);
    const br = screenToWorld({ x: window.innerWidth, y: window.innerHeight }, s.camera);
    const viewport: Bounds = { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };

    let wb = commonBounds(visible);
    wb = wb ? unionBounds(wb, viewport) : viewport;
    const padX = wb.width * 0.12 + 20;
    const padY = wb.height * 0.12 + 20;
    wb = { x: wb.x - padX, y: wb.y - padY, width: wb.width + padX * 2, height: wb.height + padY * 2 };

    const scale = Math.min(W / Math.max(wb.width, 1), H / Math.max(wb.height, 1));
    const ox = (W - wb.width * scale) / 2;
    const oy = (H - wb.height * scale) / 2;
    mapRef.current = { x: wb.x, y: wb.y, scale, ox, oy };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const toMini = (wx: number, wy: number) => ({ x: ox + (wx - wb.x) * scale, y: oy + (wy - wb.y) * scale });

    for (const el of visible) {
      const b = elementAABB(el);
      const p = toMini(b.x, b.y);
      ctx.fillStyle =
        el.fillStyle === 'solid' && el.backgroundColor !== 'transparent'
          ? el.backgroundColor
          : theme.gridDot;
      ctx.fillRect(p.x, p.y, Math.max(1.5, b.width * scale), Math.max(1.5, b.height * scale));
    }

    // viewport rectangle
    const v = toMini(viewport.x, viewport.y);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(91,108,255,0.10)';
    const vw = viewport.width * scale;
    const vh = viewport.height * scale;
    ctx.fillRect(v.x, v.y, vw, vh);
    ctx.strokeRect(v.x, v.y, vw, vh);
  };

  const schedule = () => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  };

  useEffect(() => {
    if (!open) return;
    draw();
    const un1 = useEditor.subscribe(schedule);
    const un2 = useTheme.subscribe(schedule);
    window.addEventListener('resize', schedule);
    return () => {
      un1();
      un2();
      window.removeEventListener('resize', schedule);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const navigate = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { x, y, scale, ox, oy } = mapRef.current;
    useControls.getState().centerOn?.({ x: x + (mx - ox) / scale, y: y + (my - oy) / scale });
  };

  if (!open) {
    return (
      <button
        className="panel pointer-events-auto fixed bottom-4 right-3 z-20 hidden h-9 w-9 place-items-center text-ink/60 sm:grid"
        onClick={() => setOpen(true)}
        title="Show minimap"
      >
        <MapIcon size={17} />
      </button>
    );
  }

  return (
    <div className="panel pointer-events-auto fixed bottom-4 right-3 z-20 hidden overflow-hidden p-1 sm:block">
      <canvas
        ref={canvasRef}
        style={{ width: W, height: H }}
        className="block cursor-pointer rounded-lg"
        onPointerDown={(e) => {
          draggingRef.current = true;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          navigate(e);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) navigate(e);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
      />
      <button
        className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md bg-white/70 text-ink/50 hover:text-ink dark:bg-black/40"
        onClick={() => setOpen(false)}
        title="Hide minimap"
      >
        <X size={13} />
      </button>
    </div>
  );
}

function unionBounds(a: Bounds, b: Bounds): Bounds {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: x2 - x, height: y2 - y };
}
