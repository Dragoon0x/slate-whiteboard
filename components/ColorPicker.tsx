'use client';

import { Ban, Pipette } from 'lucide-react';

const supportsEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;

// A compact row of color swatches with an optional custom-color picker.
export function ColorRow({
  colors,
  value,
  onChange,
  allowTransparent = false,
  allowCustom = true,
}: {
  colors: string[];
  value: string;
  onChange: (c: string) => void;
  allowTransparent?: boolean;
  allowCustom?: boolean;
}) {
  const pick = () => {
    const Picker = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } })
      .EyeDropper;
    new Picker()
      .open()
      .then((r) => onChange(r.sRGBHex))
      .catch(() => {
        /* user cancelled */
      });
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {colors.map((c) =>
        c === 'transparent' ? (
          <button
            key="transparent"
            className="swatch grid place-items-center bg-white dark:bg-[#2a2a2e]"
            data-active={value === 'transparent'}
            onClick={() => onChange('transparent')}
            aria-label="Transparent"
            title="Transparent"
          >
            <Ban size={13} className="text-ink/35" />
          </button>
        ) : (
          <button
            key={c}
            className="swatch"
            style={{ background: c }}
            data-active={value?.toLowerCase() === c.toLowerCase()}
            onClick={() => onChange(c)}
            aria-label={c}
            title={c}
          />
        ),
      )}
      {allowCustom && (
        <label
          className="swatch relative cursor-pointer overflow-hidden"
          style={{
            background:
              value && value !== 'transparent'
                ? value
                : 'conic-gradient(from 0deg, #ef4444, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)',
          }}
          title="Custom color"
        >
          <input
            type="color"
            value={value && value !== 'transparent' ? value : '#5B6CFF'}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      )}
      {supportsEyeDropper && (
        <button
          type="button"
          onClick={pick}
          className="swatch grid place-items-center bg-transparent text-ink/45 hover:text-ink"
          title="Pick a color from anywhere on screen"
        >
          <Pipette size={13} />
        </button>
      )}
    </div>
  );
}
