import { createLinear, createShape, createSticky, createText } from './factory';
import type { Element, StyleDefaults } from './types';
import { DEFAULT_STYLE } from './types';

const S = (over?: Partial<StyleDefaults>): StyleDefaults => ({ ...DEFAULT_STYLE, ...over });

interface BoxOpts {
  fill?: string;
  stroke?: string;
  round?: number;
  fontSize?: number;
  bold?: boolean;
  align?: 'left' | 'center';
  shape?: 'rectangle' | 'ellipse' | 'diamond';
}

function box(x: number, y: number, w: number, h: number, label: string, opts: BoxOpts = {}): Element[] {
  const shape = createShape(
    opts.shape ?? 'rectangle',
    x,
    y,
    w,
    h,
    S({
      backgroundColor: opts.fill ?? '#ffffff',
      fillStyle: 'solid',
      strokeColor: opts.stroke ?? '#111111',
    }),
  );
  shape.roundness = opts.round ?? 1;
  const fontSize = opts.fontSize ?? 16;
  const text = createText(x, y, S({ fontSize, textAlign: opts.align ?? 'center' }));
  text.text = label;
  text.x = x + (opts.align === 'left' ? 14 : 0);
  text.width = w - (opts.align === 'left' ? 28 : 0);
  text.textAlign = opts.align ?? 'center';
  text.y = y + (h - fontSize * 1.25) / 2;
  text.strokeColor = '#111111';
  return [shape, text];
}

function label(x: number, y: number, w: number, text: string, fontSize = 22): Element {
  const t = createText(x, y, S({ fontSize, textAlign: 'left' }));
  t.text = text;
  t.x = x;
  t.width = w;
  t.strokeColor = '#111111';
  return t;
}

function connect(from: { x: number; y: number }, to: { x: number; y: number }): Element {
  return createLinear('arrow', from, to, S({ strokeColor: '#6b7280', strokeWidth: 2 }));
}

function sticky(x: number, y: number, text: string, color: string): Element {
  const s = createSticky(x, y, S({ stickyColor: color }));
  s.text = text;
  s.width = 160;
  s.height = 120;
  return s;
}

// ── templates ────────────────────────────────────────────────────────────────

function flowchart(): Element[] {
  const els: Element[] = [];
  els.push(...box(0, 0, 180, 70, 'Start', { shape: 'ellipse', fill: '#eef0ff', stroke: '#5B6CFF' }));
  els.push(...box(0, 140, 180, 80, 'Collect input', {}));
  els.push(...box(-20, 290, 220, 120, 'Valid?', { shape: 'diamond', fill: '#fff7ed', stroke: '#e8590c' }));
  els.push(...box(-260, 480, 180, 80, 'Show error', { fill: '#fff5f5', stroke: '#e03131' }));
  els.push(...box(120, 480, 180, 80, 'Save & finish', { fill: '#ebfbee', stroke: '#2f9e44' }));
  els.push(connect({ x: 90, y: 70 }, { x: 90, y: 138 }));
  els.push(connect({ x: 90, y: 220 }, { x: 90, y: 288 }));
  els.push(connect({ x: 40, y: 410 }, { x: -170, y: 478 }));
  els.push(connect({ x: 140, y: 410 }, { x: 210, y: 478 }));
  return els;
}

function mindmap(): Element[] {
  const els: Element[] = [];
  els.push(...box(-90, -35, 180, 70, 'Core idea', { shape: 'ellipse', fill: '#eef0ff', stroke: '#5B6CFF', fontSize: 18 }));
  const branches: [number, number, string, string][] = [
    [-360, -160, 'Research', '#DBEAFE'],
    [200, -160, 'Design', '#DCFCE7'],
    [-360, 120, 'Build', '#FCE7F3'],
    [200, 120, 'Launch', '#EDE9FE'],
  ];
  for (const [bx, by, text, color] of branches) {
    els.push(sticky(bx, by, text, color));
    els.push(connect({ x: 0, y: 0 }, { x: bx + 80, y: by + 60 }));
  }
  return els;
}

function kanban(): Element[] {
  const els: Element[] = [];
  const cols: [string, string][] = [
    ['To do', '#f8fafc'],
    ['In progress', '#fffbeb'],
    ['Done', '#f0fdf4'],
  ];
  cols.forEach(([title, fill], i) => {
    const x = i * 280;
    const col = createShape('rectangle', x, 0, 250, 520, S({ backgroundColor: fill, fillStyle: 'solid', strokeColor: '#e4e4e7' }));
    col.roundness = 1;
    els.push(col);
    els.push(label(x + 16, 16, 220, title, 18));
  });
  els.push(sticky(10, 70, 'Define scope', '#FEF3C7'));
  els.push(sticky(10, 210, 'Gather assets', '#FEF3C7'));
  els.push(sticky(290, 70, 'Build canvas', '#DBEAFE'));
  els.push(sticky(570, 70, 'Project setup', '#DCFCE7'));
  return els;
}

function journey(): Element[] {
  const els: Element[] = [];
  const stages = ['Discover', 'Consider', 'Decide', 'Onboard', 'Advocate'];
  stages.forEach((s, i) => {
    const x = i * 240;
    els.push(...box(x, 0, 200, 80, s, { fill: '#eef0ff', stroke: '#5B6CFF' }));
    if (i < stages.length - 1) els.push(connect({ x: x + 200, y: 40 }, { x: x + 240, y: 40 }));
    els.push(sticky(x + 20, 130, 'Notes…', '#FEF3C7'));
  });
  els.unshift(label(0, -70, 600, 'User Journey', 28));
  return els;
}

function roadmap(): Element[] {
  const els: Element[] = [];
  const lanes: [string, string][] = [
    ['Now', '#ebfbee'],
    ['Next', '#fff9db'],
    ['Later', '#f1f3f5'],
  ];
  lanes.forEach(([title, fill], i) => {
    const x = i * 300;
    const lane = createShape('rectangle', x, 0, 270, 460, S({ backgroundColor: fill, fillStyle: 'solid', strokeColor: '#e4e4e7' }));
    lane.roundness = 1;
    els.push(lane);
    els.push(label(x + 16, 16, 240, title, 18));
  });
  els.push(...box(20, 70, 230, 70, 'Ship v1 canvas', { round: 1 }));
  els.push(...box(20, 160, 230, 70, 'Local autosave', { round: 1 }));
  els.push(...box(320, 70, 230, 70, 'Templates', { round: 1 }));
  els.push(...box(620, 70, 230, 70, 'Live collaboration', { round: 1 }));
  els.unshift(label(0, -70, 800, 'Product Roadmap', 28));
  return els;
}

export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  build: () => Element[];
}

export const TEMPLATES: TemplateDef[] = [
  { id: 'blank', name: 'Blank', description: 'A clean infinite canvas', build: () => [] },
  { id: 'flowchart', name: 'Flowchart', description: 'Start, decision, branches', build: flowchart },
  { id: 'mindmap', name: 'Mind Map', description: 'Central idea with branches', build: mindmap },
  { id: 'kanban', name: 'Kanban Board', description: 'To do · In progress · Done', build: kanban },
  { id: 'journey', name: 'User Journey', description: 'Stages across the experience', build: journey },
  { id: 'roadmap', name: 'Product Roadmap', description: 'Now · Next · Later lanes', build: roadmap },
];
