'use client';

import { FONT_STACKS } from '@/lib/constants';
import { worldToScreen } from '@/lib/geometry';
import { useEditor } from '@/lib/store';
import { useEffect, useLayoutEffect, useRef } from 'react';

// A textarea overlaid on the canvas while a text/sticky element is being edited.
export function TextEditor() {
  const editingId = useEditor((s) => s.editingId);
  const ref = useRef<HTMLTextAreaElement>(null);
  // re-render this overlay as the camera moves while editing
  const camTick = useEditor((s) => `${s.camera.x},${s.camera.y},${s.camera.zoom}`);

  const el = useEditor((s) => s.elements.find((e) => e.id === s.editingId));

  useLayoutEffect(() => {
    if (!ref.current || !el) return;
    const ta = ref.current;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [el?.text, camTick, el]);

  useEffect(() => {
    if (editingId && ref.current) {
      const ta = ref.current;
      // focus + place caret at end on next frame
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      });
    }
  }, [editingId]);

  if (!el || (el.type !== 'text' && el.type !== 'sticky')) return null;

  const { camera } = useEditor.getState();
  const screen = worldToScreen({ x: el.x, y: el.y }, camera);
  const pad = el.type === 'sticky' ? 14 : 0;
  const fontSize = (el.fontSize ?? 20) * camera.zoom;
  const lineHeight = el.lineHeight ?? 1.25;
  const color = el.type === 'sticky' ? '#27272a' : el.strokeColor;

  const commit = () => {
    const state = useEditor.getState();
    const current = state.elements.find((e) => e.id === el.id);
    if (!current) {
      state.setEditing(null);
      return;
    }
    // remove an empty text element; keep empty sticky notes
    if (current.type === 'text' && !current.text?.trim()) {
      state.setElements(state.elements.filter((e) => e.id !== current.id));
      state.setSelection([]);
    }
    state.setEditing(null);
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const state = useEditor.getState();
    // grow height to fit content (world units)
    const ta = ref.current;
    let height = el.height;
    if (ta) {
      ta.style.height = 'auto';
      const screenH = ta.scrollHeight;
      height = Math.max(el.height, screenH / camera.zoom + pad);
    }
    state.setElements(
      state.elements.map((x) =>
        x.id === el.id ? { ...x, text: value, height, updated: Date.now() } : x,
      ),
    );
  };

  return (
    <textarea
      ref={ref}
      value={el.text ?? ''}
      onChange={onChange}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          commit();
        }
        e.stopPropagation();
      }}
      spellCheck={false}
      wrap="soft"
      style={{
        position: 'absolute',
        left: screen.x,
        top: screen.y,
        width: el.width * camera.zoom - pad * 2 * camera.zoom,
        transform: `translate(${pad * camera.zoom}px, ${pad * camera.zoom}px) rotate(${el.angle}rad)`,
        transformOrigin: 'top left',
        fontFamily: FONT_STACKS[el.fontFamily ?? 'sans'],
        fontSize,
        lineHeight,
        fontWeight: el.fontWeight ?? 400,
        fontStyle: el.italic ? 'italic' : 'normal',
        letterSpacing: `${(el.letterSpacing ?? 0) * camera.zoom}px`,
        color,
        textAlign: (el.textAlign ?? 'left') as React.CSSProperties['textAlign'],
        background: 'transparent',
        border: 'none',
        outline: 'none',
        resize: 'none',
        overflow: 'hidden',
        padding: 0,
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        zIndex: 30,
      }}
    />
  );
}
