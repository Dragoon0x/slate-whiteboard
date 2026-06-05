'use client';

import { ColorRow } from '@/components/ColorPicker';
import {
  FILL_COLORS,
  FONT_SIZES,
  FONT_WEIGHTS,
  FRAME_PRESETS,
  SHADOW_PRESETS,
  STICKY_COLORS,
  STROKE_COLORS,
  STROKE_WIDTHS,
} from '@/lib/constants';
import { extractPalette } from '@/lib/palette';
import { useEditor } from '@/lib/store';
import { DEFAULT_FILTERS, type Element, type ElementType, type Tool } from '@/lib/types';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Copy,
  Group,
  Italic,
  List,
  ListOrdered,
  Lock,
  Palette,
  SendToBack,
  Trash2,
  Ungroup,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

function toolType(tool: Tool): ElementType | null {
  const map: Partial<Record<Tool, ElementType>> = {
    rectangle: 'rectangle',
    ellipse: 'ellipse',
    diamond: 'diamond',
    triangle: 'triangle',
    line: 'line',
    arrow: 'arrow',
    pen: 'draw',
    text: 'text',
    sticky: 'sticky',
    frame: 'frame',
  };
  return map[tool] ?? null;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-black/[0.05] px-3.5 py-2.5 first:border-t-0 dark:border-white/[0.07]">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink/40">{label}</div>
      {children}
    </div>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: React.ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-black/[0.04] p-0.5 dark:bg-white/[0.06]">
      {options.map((o) => (
        <button
          key={String(o.value)}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`flex h-7 flex-1 items-center justify-center rounded-md text-sm transition-all ${
            value === o.value ? 'bg-white text-ink shadow-soft dark:bg-white/10' : 'text-ink/55 hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StylePanel() {
  const elements = useEditor((s) => s.elements);
  const selectedIds = useEditor((s) => s.selectedIds);
  const style = useEditor((s) => s.style);
  const tool = useEditor((s) => s.tool);
  const setStyle = useEditor((s) => s.setStyle);
  const updateElements = useEditor((s) => s.updateElements);
  const [palette, setPalette] = useState<string[]>([]);
  const nameBefore = useRef<typeof elements | null>(null);

  const selected = useMemo(() => {
    const set = new Set(selectedIds);
    return elements.filter((e) => set.has(e.id));
  }, [elements, selectedIds]);

  const hasSelection = selected.length > 0;
  const ref = hasSelection ? selected[0] : null;

  const types = useMemo(() => {
    if (hasSelection) return new Set(selected.map((e) => e.type));
    const t = toolType(tool);
    return new Set(t ? [t] : []);
  }, [hasSelection, selected, tool]);

  const visible = hasSelection || toolType(tool) !== null;
  if (!visible) return null;

  const has = (...t: ElementType[]) => t.some((x) => types.has(x));
  const showFill = has('rectangle', 'ellipse', 'diamond', 'triangle');
  const showStrokeWidth = has('rectangle', 'ellipse', 'diamond', 'triangle', 'line', 'arrow', 'draw');
  const showText = has('text', 'sticky');
  const showSticky = has('sticky');
  const showRound = has('rectangle');
  const onlyText = showText && !showFill && !has('line', 'arrow', 'draw');
  const imageSel = hasSelection && selected.length === 1 && selected[0].type === 'image' ? selected[0] : null;
  const frameSel = hasSelection && selected.length === 1 && selected[0].type === 'frame' ? selected[0] : null;
  const showEffects = showFill && hasSelection; // gradient/shadow apply to a real element

  const v = {
    strokeColor: ref?.strokeColor ?? style.strokeColor,
    backgroundColor: ref?.backgroundColor ?? style.backgroundColor,
    strokeWidth: ref?.strokeWidth ?? style.strokeWidth,
    strokeStyle: ref?.strokeStyle ?? style.strokeStyle,
    opacity: ref?.opacity ?? style.opacity,
    roundness: ref?.roundness ?? style.roundness,
    fontSize: ref?.fontSize ?? style.fontSize,
    fontFamily: ref?.fontFamily ?? style.fontFamily,
    textAlign: ref?.textAlign ?? style.textAlign,
    fontWeight: ref?.fontWeight ?? style.fontWeight,
    italic: ref?.italic ?? style.italic,
    lineHeight: ref?.lineHeight ?? style.lineHeight,
    letterSpacing: ref?.letterSpacing ?? style.letterSpacing,
    list: ref?.list ?? 'none',
    gradient: ref?.gradient,
    shadow: ref?.shadow,
    filters: imageSel?.filters ?? DEFAULT_FILTERS,
  };

  // gradient/shadow are per-element (not in StyleDefaults) → patch the selection
  const patchSel = (patch: Partial<Element>) => {
    if (selectedIds.length) updateElements(selectedIds, patch);
  };
  const toggleGradient = () => {
    if (v.gradient) patchSel({ gradient: undefined });
    else {
      const base = v.backgroundColor !== 'transparent' ? v.backgroundColor : '#a5d8ff';
      patchSel({ gradient: { stops: [{ color: base, at: 0 }, { color: '#5B6CFF', at: 1 }], angle: 90 } });
    }
  };
  const setStop = (i: number, color: string) => {
    if (!v.gradient) return;
    const stops = v.gradient.stops.map((s, idx) => (idx === i ? { ...s, color } : s));
    patchSel({ gradient: { ...v.gradient, stops } });
  };

  const st = useEditor.getState();

  return (
    <div className="pointer-events-auto fixed left-3 top-20 z-20 w-56 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-black/[0.06] bg-white/90 shadow-panel backdrop-blur-xl [scrollbar-width:thin] dark:border-white/10 dark:bg-[#1c1c1f]/95">
      {!showSticky && (
        <Section label={onlyText ? 'Text color' : 'Stroke'}>
          <ColorRow colors={STROKE_COLORS} value={v.strokeColor} onChange={(c) => setStyle({ strokeColor: c })} />
        </Section>
      )}

      {showFill && (
        <Section label="Fill">
          <ColorRow
            colors={FILL_COLORS}
            value={v.backgroundColor}
            onChange={(c) => setStyle({ backgroundColor: c, fillStyle: c === 'transparent' ? 'transparent' : 'solid' })}
            allowTransparent
          />
        </Section>
      )}

      {showEffects && (
        <Section label="Fill effects">
          <Segmented
            value={v.gradient ? 'gradient' : 'solid'}
            onChange={() => toggleGradient()}
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'gradient', label: 'Gradient' },
            ]}
          />
          {v.gradient && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={v.gradient.stops[0]?.color ?? '#a5d8ff'}
                onChange={(e) => setStop(0, e.target.value)}
                className="h-7 w-7 cursor-pointer rounded-md border border-black/10 bg-transparent p-0 dark:border-white/15"
                title="Gradient start"
              />
              <input
                type="range"
                min={0}
                max={360}
                step={5}
                value={v.gradient.angle}
                onChange={(e) => patchSel({ gradient: { ...v.gradient!, angle: Number(e.target.value) } })}
                className="flex-1 accent-accent"
                title="Gradient angle"
              />
              <input
                type="color"
                value={v.gradient.stops[1]?.color ?? '#5B6CFF'}
                onChange={(e) => setStop(1, e.target.value)}
                className="h-7 w-7 cursor-pointer rounded-md border border-black/10 bg-transparent p-0 dark:border-white/15"
                title="Gradient end"
              />
            </div>
          )}
          <div className="mt-2 text-[11px] font-medium text-ink/40">Shadow</div>
          <div className="mt-1">
            <Segmented
              value={v.shadow ? SHADOW_PRESETS.find((p) => p.blur === v.shadow!.blur)?.name ?? 'Soft' : 'none'}
              onChange={(name) => {
                if (name === 'none') patchSel({ shadow: undefined });
                else {
                  const p = SHADOW_PRESETS.find((x) => x.name === name)!;
                  patchSel({ shadow: { x: p.x, y: p.y, blur: p.blur, color: p.color } });
                }
              }}
              options={[
                { value: 'none', label: 'Off' },
                ...SHADOW_PRESETS.map((p) => ({ value: p.name, label: p.name })),
              ]}
            />
          </div>
        </Section>
      )}

      {showSticky && (
        <Section label="Note color">
          <div className="flex flex-wrap gap-1.5">
            {STICKY_COLORS.map((c) => (
              <button
                key={c.name}
                className="swatch"
                style={{ background: c.fill }}
                data-active={v.backgroundColor?.toLowerCase() === c.fill.toLowerCase()}
                onClick={() => setStyle({ stickyColor: c.fill })}
                title={c.name}
              />
            ))}
          </div>
        </Section>
      )}

      {frameSel && (
        <Section label="Frame">
          <input
            value={frameSel.name ?? ''}
            placeholder="Frame name"
            onFocus={() => {
              nameBefore.current = useEditor.getState().elements;
            }}
            onChange={(e) => updateElements([frameSel.id], { name: e.target.value }, false)}
            onBlur={() => {
              if (nameBefore.current) useEditor.getState().commit(nameBefore.current);
              nameBefore.current = null;
            }}
            className="w-full rounded-md border border-black/[0.07] bg-transparent px-2 py-1 text-sm text-ink outline-none focus:border-accent/40 dark:border-white/10"
          />
          <div className="mb-1 mt-2 text-[11px] font-medium text-ink/40">Background</div>
          <ColorRow
            colors={['#ffffff', '#fbfbfa', '#f4f4f5', '#0f0f10', '#1c1c1f']}
            value={frameSel.backgroundColor}
            onChange={(c) => updateElements([frameSel.id], { backgroundColor: c, fillStyle: 'solid' })}
          />
          <div className="mb-1 mt-2 text-[11px] font-medium text-ink/40">Aspect</div>
          <div className="grid grid-cols-3 gap-1">
            {FRAME_PRESETS.map((p) => (
              <button
                key={p.id}
                title={`${p.w}×${p.h}`}
                onClick={() => {
                  updateElements([frameSel.id], { width: p.w, height: p.h });
                  useEditor.getState().applyMembership();
                }}
                className="rounded-md bg-black/[0.04] px-1 py-1.5 text-[11px] text-ink/70 hover:bg-black/[0.07] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
              >
                {p.name.replace(/^[^ ]+ /, '')}
              </button>
            ))}
          </div>
        </Section>
      )}

      {showStrokeWidth && (
        <Section label="Stroke width">
          <Segmented
            value={v.strokeWidth}
            onChange={(w) => setStyle({ strokeWidth: w })}
            options={STROKE_WIDTHS.map((w) => ({
              value: w,
              title: `${w}px`,
              label: <span className="rounded-full bg-current" style={{ width: 18, height: Math.max(2, w) }} />,
            }))}
          />
          <div className="mt-2">
            <Segmented
              value={v.strokeStyle}
              onChange={(s) => setStyle({ strokeStyle: s })}
              options={[
                { value: 'solid', label: '———', title: 'Solid' },
                { value: 'dashed', label: '- - -', title: 'Dashed' },
                { value: 'dotted', label: '· · ·', title: 'Dotted' },
              ]}
            />
          </div>
        </Section>
      )}

      {showRound && (
        <Section label="Edges">
          <Segmented
            value={v.roundness > 0 ? 1 : 0}
            onChange={(r) => setStyle({ roundness: r })}
            options={[
              { value: 0, label: 'Sharp' },
              { value: 1, label: 'Round' },
            ]}
          />
        </Section>
      )}

      {showText && (
        <Section label="Text">
          <Segmented
            value={v.fontSize ?? 20}
            onChange={(s) => setStyle({ fontSize: s })}
            options={FONT_SIZES.map((f) => ({ value: f.value, label: f.label, title: `${f.value}px` }))}
          />
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Segmented
              value={v.fontFamily ?? 'sans'}
              onChange={(f) => setStyle({ fontFamily: f })}
              options={[
                { value: 'sans', label: 'Aa', title: 'Sans' },
                { value: 'serif', label: <span className="font-serif">Aa</span>, title: 'Serif' },
                { value: 'mono', label: <span className="font-mono">Aa</span>, title: 'Mono' },
              ]}
            />
            <div className="col-span-2">
              <Segmented
                value={v.textAlign ?? 'left'}
                onChange={(a) => setStyle({ textAlign: a })}
                options={[
                  { value: 'left', label: <AlignLeft size={15} /> },
                  { value: 'center', label: <AlignCenter size={15} /> },
                  { value: 'right', label: <AlignRight size={15} /> },
                ]}
              />
            </div>
          </div>

          <div className="mt-2 flex items-center gap-1.5">
            <div className="flex-1">
              <Segmented
                value={v.fontWeight}
                onChange={(w) => setStyle({ fontWeight: w })}
                options={FONT_WEIGHTS.map((f) => ({ value: f.value, label: f.label }))}
              />
            </div>
            <button
              onClick={() => setStyle({ italic: !v.italic })}
              title="Italic"
              className={`grid h-8 w-8 place-items-center rounded-md text-sm transition-all ${
                v.italic ? 'bg-accent text-white' : 'bg-black/[0.04] text-ink/60 dark:bg-white/[0.06]'
              }`}
            >
              <Italic size={14} />
            </button>
            <button
              onClick={() => patchSel({ list: v.list === 'bullet' ? 'none' : 'bullet' })}
              title="Bulleted list"
              className={`grid h-8 w-8 place-items-center rounded-md text-sm transition-all ${
                v.list === 'bullet' ? 'bg-accent text-white' : 'bg-black/[0.04] text-ink/60 dark:bg-white/[0.06]'
              }`}
            >
              <List size={15} />
            </button>
            <button
              onClick={() => patchSel({ list: v.list === 'number' ? 'none' : 'number' })}
              title="Numbered list"
              className={`grid h-8 w-8 place-items-center rounded-md text-sm transition-all ${
                v.list === 'number' ? 'bg-accent text-white' : 'bg-black/[0.04] text-ink/60 dark:bg-white/[0.06]'
              }`}
            >
              <ListOrdered size={15} />
            </button>
          </div>

          <div className="mt-2">
            <Segmented
              value={v.lineHeight}
              onChange={(lh) => setStyle({ lineHeight: lh })}
              options={[
                { value: 1, label: '1.0', title: 'Tight' },
                { value: 1.25, label: '1.25' },
                { value: 1.5, label: '1.5' },
                { value: 2, label: '2.0', title: 'Loose' },
              ]}
            />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-ink/40">Spacing</span>
            <input
              type="range"
              min={-1}
              max={8}
              step={0.5}
              value={v.letterSpacing}
              onChange={(e) => setStyle({ letterSpacing: Number(e.target.value) })}
              className="flex-1 accent-accent"
              title="Letter spacing"
            />
          </div>
        </Section>
      )}

      {imageSel && (
        <Section label="Adjustments">
          {(
            [
              ['brightness', 'Brightness', 0, 200],
              ['contrast', 'Contrast', 0, 200],
              ['saturate', 'Saturation', 0, 200],
              ['grayscale', 'Grayscale', 0, 100],
              ['blur', 'Blur', 0, 20],
            ] as const
          ).map(([key, label, min, max]) => (
            <div key={key} className="mb-1.5 flex items-center gap-2">
              <span className="w-16 shrink-0 text-[11px] text-ink/45">{label}</span>
              <input
                type="range"
                min={min}
                max={max}
                value={v.filters[key]}
                onChange={(e) =>
                  updateElements([imageSel.id], {
                    filters: { ...v.filters, [key]: Number(e.target.value) },
                  })
                }
                className="flex-1 accent-accent"
              />
            </div>
          ))}
          <div className="mt-2 flex gap-2">
            <button
              className="btn flex-1 border border-black/[0.07] py-1.5 text-xs dark:border-white/10"
              onClick={() => updateElements([imageSel.id], { filters: { ...DEFAULT_FILTERS } })}
            >
              Reset
            </button>
            <button
              className="btn flex-1 border border-black/[0.07] py-1.5 text-xs dark:border-white/10"
              onClick={() => {
                if (imageSel.fileId) extractPalette(imageSel.fileId).then(setPalette);
              }}
            >
              <Palette size={14} /> Palette
            </button>
          </div>
          {palette.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {palette.map((c) => (
                <button
                  key={c}
                  className="swatch"
                  style={{ background: c }}
                  title={`Use ${c} as draw color`}
                  onClick={() => st.setStyleSilently({ strokeColor: c })}
                />
              ))}
            </div>
          )}
        </Section>
      )}

      <Section label="Opacity">
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={v.opacity}
          onChange={(e) => setStyle({ opacity: Number(e.target.value) })}
          className="w-full accent-accent"
        />
      </Section>

      {hasSelection && (
        <Section label="Arrange">
          <div className="grid grid-cols-4 gap-1">
            <button className="btn !px-0 py-1.5" title="Duplicate (⌘D)" onClick={() => st.duplicateSelected()}>
              <Copy size={16} />
            </button>
            <button className="btn !px-0 py-1.5" title="Send to back" onClick={() => st.sendToBack()}>
              <SendToBack size={16} />
            </button>
            <button className="btn !px-0 py-1.5" title="Lock" onClick={() => st.toggleLockSelected()}>
              <Lock size={16} />
            </button>
            <button
              className="btn !px-0 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
              title="Delete (⌫)"
              onClick={() => st.deleteSelected()}
            >
              <Trash2 size={16} />
            </button>
          </div>
          {selected.length > 1 && (
            <div className="mt-1 grid grid-cols-2 gap-1">
              <button className="btn py-1.5 text-xs" onClick={() => st.group()}>
                <Group size={15} /> Group
              </button>
              <button className="btn py-1.5 text-xs" onClick={() => st.ungroup()}>
                <Ungroup size={15} /> Ungroup
              </button>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
