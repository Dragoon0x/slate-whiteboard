// Palette + tunable constants. Monochrome-forward with a single blue accent.

export const ACCENT = '#5B6CFF';

export const STROKE_COLORS = [
  '#111111',
  '#5B6CFF',
  '#1971c2',
  '#2f9e44',
  '#e8590c',
  '#e03131',
  '#9c36b5',
  '#868e96',
];

export const FILL_COLORS = [
  'transparent',
  '#ffec99',
  '#b2f2bb',
  '#a5d8ff',
  '#ffc9c9',
  '#eebefa',
  '#dee2e6',
];

export interface StickyColor {
  name: string;
  fill: string;
  text: string;
}

export const STICKY_COLORS: StickyColor[] = [
  { name: 'Yellow', fill: '#FEF3C7', text: '#854d0e' },
  { name: 'Blue', fill: '#DBEAFE', text: '#1e40af' },
  { name: 'Green', fill: '#DCFCE7', text: '#166534' },
  { name: 'Pink', fill: '#FCE7F3', text: '#9d174d' },
  { name: 'Purple', fill: '#EDE9FE', text: '#5b21b6' },
];

export const STROKE_WIDTHS = [1, 2, 4, 8];

export const FONT_SIZES = [
  { label: 'S', value: 16 },
  { label: 'M', value: 20 },
  { label: 'L', value: 28 },
  { label: 'XL', value: 40 },
];

// Camera limits
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 30;
export const ZOOM_STEP = 1.1;

// Grid + snapping
export const GRID_SIZE = 20;
export const SNAP_THRESHOLD = 6; // screen px
export const SNAP_DISTANCE_WORLD = 8;

// Selection handle sizing (screen px)
export const HANDLE_SIZE = 9;
export const ROTATE_HANDLE_OFFSET = 26;

// Defaults
export const DEFAULT_STICKY_SIZE = 180;
export const DEFAULT_TEXT_WIDTH = 200;

export const FONT_STACKS: Record<string, string> = {
  sans: "'Inter', 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  serif: "'Iowan Old Style', 'Palatino', Georgia, serif",
  mono: "'SF Mono', ui-monospace, 'JetBrains Mono', Menlo, monospace",
};

export const HISTORY_LIMIT = 120;

// ── Theme palette ───────────────────────────────────────────────────────────
// Single source of truth for canvas rendering + meta theme-color.
export interface ThemeColors {
  canvas: string;
  ink: string;
  panel: string;
  gridDot: string;
  gridLine: string;
  defaultStroke: string;
}

export const THEME: Record<'light' | 'dark', ThemeColors> = {
  light: {
    canvas: '#fbfbfa',
    ink: '#111111',
    panel: 'rgba(255,255,255,0.90)',
    gridDot: 'rgba(17,17,17,0.10)',
    gridLine: 'rgba(17,17,17,0.06)',
    defaultStroke: '#111111',
  },
  dark: {
    canvas: '#0f0f10',
    ink: '#f5f5f5',
    panel: 'rgba(28,28,31,0.92)',
    gridDot: 'rgba(245,245,245,0.13)',
    gridLine: 'rgba(245,245,245,0.07)',
    defaultStroke: '#f5f5f5',
  },
};

// ── Fill-effect presets ─────────────────────────────────────────────────────
export const SHADOW_PRESETS = [
  { name: 'Soft', x: 0, y: 2, blur: 8, color: 'rgba(17,17,17,0.18)' },
  { name: 'Medium', x: 0, y: 6, blur: 18, color: 'rgba(17,17,17,0.22)' },
  { name: 'Strong', x: 0, y: 14, blur: 34, color: 'rgba(17,17,17,0.28)' },
] as const;

// ── Frame / artboard size presets ───────────────────────────────────────────
export interface FramePreset {
  id: string;
  name: string;
  w: number;
  h: number;
}

export const FRAME_PRESETS: FramePreset[] = [
  { id: 'wide', name: 'Slide 16:9', w: 1920, h: 1080 },
  { id: 'tall', name: 'Story 9:16', w: 1080, h: 1920 },
  { id: 'square', name: 'Square 1:1', w: 1080, h: 1080 },
  { id: 'classic', name: 'Screen 4:3', w: 1024, h: 768 },
  { id: 'a4l', name: 'A4 landscape', w: 842, h: 595 },
  { id: 'a4p', name: 'A4 portrait', w: 595, h: 842 },
];

export const DEFAULT_FRAME_BG = '#ffffff';
export const FONT_WEIGHTS: { label: string; value: 400 | 500 | 600 | 700 }[] = [
  { label: 'Reg', value: 400 },
  { label: 'Med', value: 500 },
  { label: 'Semi', value: 600 },
  { label: 'Bold', value: 700 },
];
