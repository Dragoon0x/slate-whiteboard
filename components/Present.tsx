'use client';

import { renderScene } from '@/components/canvas/render';
import { ensureImages, getCachedImage } from '@/components/canvas/assets';
import { cameraForBounds, childrenOf, sortFrames } from '@/lib/frames';
import { useEditor } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import type { Camera } from '@/lib/types';
import { ChevronLeft, ChevronRight, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const BACKDROP = '#0c0c0e';
const DURATION = 450;

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Full-screen slideshow over the board's frames. Mounted only while presenting.
export function Present() {
  const slideIndex = useEditor((s) => s.slideIndex);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const animRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const laserRef = useRef<HTMLDivElement>(null);
  const [laser, setLaser] = useState(false);
  const slideCount = useEditor((s) => sortFrames(s.elements).length);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h, dpr } = sizeRef.current;
    const st = useEditor.getState();
    const frames = sortFrames(st.elements);
    const frame = frames[Math.min(st.slideIndex, frames.length - 1)];
    const els = frame ? [frame, ...childrenOf(frame.id, st.elements)] : [];
    ensureImages(els, scheduleDraw);
    renderScene({
      ctx,
      width: w,
      height: h,
      dpr,
      camera: camRef.current,
      elements: els,
      getImage: getCachedImage,
      grid: false,
      selectedIds: [],
      hoveredId: null,
      editingId: null,
      selectionFrame: null,
      marquee: null,
      snapGuides: [],
      theme: useTheme.getState().resolved,
      background: BACKDROP,
      bgStyle: 'solid',
    });
  };

  const scheduleDraw = () => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  };

  const tweenTo = (target: Camera) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const start = { ...camRef.current };
    const t0 = performance.now();
    const step = () => {
      const t = Math.min((performance.now() - t0) / DURATION, 1);
      const e = easeInOut(t);
      camRef.current = {
        x: lerp(start.x, target.x, e),
        y: lerp(start.y, target.y, e),
        zoom: Math.exp(lerp(Math.log(start.zoom), Math.log(target.zoom), e)),
      };
      draw();
      if (t < 1) animRef.current = requestAnimationFrame(step);
    };
    step();
  };

  const targetForSlide = (index: number): Camera | null => {
    const frames = sortFrames(useEditor.getState().elements);
    const frame = frames[Math.min(index, frames.length - 1)];
    if (!frame) return null;
    const { w, h } = sizeRef.current;
    return cameraForBounds(
      { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      w,
      h,
      48,
      4,
    );
  };

  // mount: size, capture camera, listeners
  useEffect(() => {
    const canvas = canvasRef.current!;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      sizeRef.current = { w: window.innerWidth, h: window.innerHeight, dpr };
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      const t = targetForSlide(useEditor.getState().slideIndex);
      if (t) {
        camRef.current = t;
        draw();
      }
    };
    sizeRef.current = {
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: Math.min(window.devicePixelRatio || 1, 2.5),
    };
    canvas.width = Math.round(window.innerWidth * sizeRef.current.dpr);
    canvas.height = Math.round(window.innerHeight * sizeRef.current.dpr);
    camRef.current = { ...useEditor.getState().camera };
    const t = targetForSlide(useEditor.getState().slideIndex);
    if (t) tweenTo(t);

    const next = () => {
      const n = sortFrames(useEditor.getState().elements).length;
      useEditor.getState().setSlideIndex(Math.min(useEditor.getState().slideIndex + 1, n - 1));
    };
    const prev = () => {
      useEditor.getState().setSlideIndex(Math.max(useEditor.getState().slideIndex - 1, 0));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prev();
      } else if (e.key === 'Escape') {
        useEditor.getState().exitPresent();
      } else if (e.key.toLowerCase() === 'l') {
        setLaser((v) => !v);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (laserRef.current) {
        laserRef.current.style.left = `${e.clientX}px`;
        laserRef.current.style.top = `${e.clientY}px`;
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove);
    const stored = { ...useEditor.getState().camera };
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      useEditor.getState().setCamera(stored); // restore the editor view
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // animate to the active slide
  useEffect(() => {
    const t = targetForSlide(slideIndex);
    if (t) tweenTo(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideIndex]);

  const setSlide = (i: number) =>
    useEditor.getState().setSlideIndex(Math.max(0, Math.min(i, slideCount - 1)));

  return (
    <div className="fixed inset-0 z-[100] bg-[#0c0c0e]">
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-default"
        style={{ width: '100vw', height: '100vh' }}
        onClick={(e) => {
          // click right half → next, left quarter → prev
          if (e.clientX > window.innerWidth * 0.3) setSlide(slideIndex + 1);
          else setSlide(slideIndex - 1);
        }}
      />

      {/* controls */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 flex items-center justify-center">
        <div className="panel pointer-events-auto flex items-center gap-1 p-1.5">
          <button className="tool-btn" onClick={() => setSlide(slideIndex - 1)} disabled={slideIndex <= 0} title="Previous">
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[3.5rem] text-center text-sm font-medium tabular-nums text-ink/70">
            {Math.min(slideIndex + 1, slideCount)} / {slideCount}
          </span>
          <button
            className="tool-btn"
            onClick={() => setSlide(slideIndex + 1)}
            disabled={slideIndex >= slideCount - 1}
            title="Next"
          >
            <ChevronRight size={18} />
          </button>
          <span className="mx-0.5 h-6 w-px bg-black/[0.08] dark:bg-white/10" />
          <button className="tool-btn" data-active={laser} onClick={() => setLaser((v) => !v)} title="Laser pointer (L)">
            <Zap size={17} />
          </button>
          <button className="tool-btn" onClick={() => useEditor.getState().exitPresent()} title="Exit (Esc)">
            <X size={18} />
          </button>
        </div>
      </div>

      {laser && (
        <div
          ref={laserRef}
          className="pointer-events-none fixed z-[110] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(255,60,60,0.95), rgba(255,60,60,0.25))', boxShadow: '0 0 12px 4px rgba(255,60,60,0.5)' }}
        />
      )}
    </div>
  );
}
