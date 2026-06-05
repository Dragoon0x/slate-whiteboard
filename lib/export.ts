import { drawElement, fontString, imageFilterString, wrapText } from '@/components/canvas/render';
import { FONT_STACKS } from './constants';
import { freehandOutline } from './freehand';
import { commonBounds, elementCenter } from './geometry';
import type { Bounds } from './geometry';
import { sortFrames } from './frames';
import { nanoid } from './id';
import { getAsset, saveAsset, saveBoard } from './storage';
import type { AssetRecord, BoardRecord, Camera, Element } from './types';

// ── download helpers ─────────────────────────────────────────────────────────

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function sanitizeFilename(name: string): string {
  return (name || 'board').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-') || 'board';
}

// ── asset loading ────────────────────────────────────────────────────────────

async function loadImages(elements: Element[]): Promise<Map<string, HTMLImageElement>> {
  const map = new Map<string, HTMLImageElement>();
  const urls: string[] = [];
  await Promise.all(
    elements
      .filter((e) => e.type === 'image' && e.fileId)
      .map(async (e) => {
        const asset = await getAsset(e.fileId!);
        if (!asset) return;
        const url = URL.createObjectURL(asset.blob);
        urls.push(url);
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            map.set(e.fileId!, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = url;
        });
      }),
  );
  // URLs intentionally kept alive until the surrounding render completes; the
  // caller's synchronous render runs before this microtask scope is GC'd.
  setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 5000);
  return map;
}

// ── raster export ────────────────────────────────────────────────────────────

interface RasterOpts {
  scale?: number;
  padding?: number;
  background?: string | null;
  crop?: Bounds; // exact bounds (used for per-frame export)
}

export async function renderToCanvas(
  elements: Element[],
  opts: RasterOpts = {},
): Promise<HTMLCanvasElement> {
  const scale = opts.scale ?? 2;
  const pad = opts.crop ? 0 : opts.padding ?? 32;
  const visible = elements.filter((e) => !e.hidden);
  const bounds = opts.crop ?? commonBounds(visible) ?? { x: 0, y: 0, width: 100, height: 100 };
  const images = await loadImages(visible);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil((bounds.width + pad * 2) * scale));
  canvas.height = Math.max(1, Math.ceil((bounds.height + pad * 2) * scale));
  const ctx = canvas.getContext('2d')!;

  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.setTransform(scale, 0, 0, scale, (pad - bounds.x) * scale, (pad - bounds.y) * scale);
  for (const el of visible) {
    drawElement(ctx, el, (id) => images.get(id));
  }
  return canvas;
}

interface ScopeOpts {
  crop?: Bounds;
  background?: string | null;
}

export async function exportPNG(elements: Element[], name: string, opts: ScopeOpts = {}) {
  const canvas = await renderToCanvas(elements, { background: opts.background ?? null, crop: opts.crop });
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `${sanitizeFilename(name)}.png`);
  }, 'image/png');
}

export async function exportJPG(elements: Element[], name: string, opts: ScopeOpts = {}) {
  const canvas = await renderToCanvas(elements, { background: opts.background ?? '#ffffff', crop: opts.crop });
  canvas.toBlob(
    (blob) => {
      if (blob) downloadBlob(blob, `${sanitizeFilename(name)}.jpg`);
    },
    'image/jpeg',
    0.92,
  );
}

// ── SVG export (vector) ──────────────────────────────────────────────────────

let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dashArray(el: Element): string {
  if (el.strokeStyle === 'dashed') return `stroke-dasharray="${el.strokeWidth * 3} ${el.strokeWidth * 2.5}"`;
  if (el.strokeStyle === 'dotted') return `stroke-dasharray="0.1 ${el.strokeWidth * 2.2}" stroke-linecap="round"`;
  return '';
}

function elementToSVG(el: Element, images: Map<string, string>): string {
  if (el.hidden) return '';
  const c = elementCenter(el);
  const deg = (el.angle * 180) / Math.PI;
  const sx = el.flipX ? -1 : 1;
  const sy = el.flipY ? -1 : 1;
  const flip =
    el.flipX || el.flipY ? ` translate(${c.x} ${c.y}) scale(${sx} ${sy}) translate(${-c.x} ${-c.y})` : '';
  const open = `<g opacity="${(el.opacity ?? 100) / 100}" transform="rotate(${deg} ${c.x} ${c.y})${flip}">`;
  const close = `</g>`;
  const stroke =
    el.strokeColor !== 'transparent' && el.strokeWidth > 0
      ? `stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"`
      : 'stroke="none"';
  const fill = el.fillStyle === 'solid' && el.backgroundColor !== 'transparent' ? el.backgroundColor : 'none';
  const dash = dashArray(el);
  const { x, y, width: w, height: h } = el;
  let body = '';

  // gradient + drop shadow defs (closed shapes)
  let defs = '';
  let fillAttr = `fill="${fill}"`;
  let filterAttr = '';
  if (el.gradient && el.gradient.stops.length >= 2) {
    const rad = (el.gradient.angle * Math.PI) / 180;
    const x1 = (0.5 - Math.cos(rad) * 0.5).toFixed(4);
    const y1 = (0.5 - Math.sin(rad) * 0.5).toFixed(4);
    const x2 = (0.5 + Math.cos(rad) * 0.5).toFixed(4);
    const y2 = (0.5 + Math.sin(rad) * 0.5).toFixed(4);
    const stops = [...el.gradient.stops]
      .sort((a, b) => a.at - b.at)
      .map((s) => `<stop offset="${Math.round(Math.max(0, Math.min(1, s.at)) * 100)}%" stop-color="${s.color}"/>`)
      .join('');
    defs += `<linearGradient id="g${el.id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`;
    fillAttr = `fill="url(#g${el.id})"`;
  }
  if (el.shadow) {
    defs += `<filter id="s${el.id}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="${el.shadow.x}" dy="${el.shadow.y}" stdDeviation="${(el.shadow.blur / 2).toFixed(2)}" flood-color="${el.shadow.color}"/></filter>`;
    filterAttr = `filter="url(#s${el.id})"`;
  }

  switch (el.type) {
    case 'rectangle': {
      const r = (el.roundness ?? 0) * Math.min(w, h) * 0.25;
      body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" ${fillAttr} ${stroke} ${filterAttr} ${dash}/>`;
      break;
    }
    case 'ellipse':
      body = `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${fillAttr} ${stroke} ${filterAttr} ${dash}/>`;
      break;
    case 'diamond':
      body = `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" ${fillAttr} ${stroke} ${filterAttr} ${dash}/>`;
      break;
    case 'triangle':
      body = `<polygon points="${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}" ${fillAttr} ${stroke} ${filterAttr} ${dash}/>`;
      break;
    case 'line':
    case 'arrow': {
      const pts = (el.points ?? []).map((p) => `${x + p.x},${y + p.y}`).join(' ');
      body = `<polyline points="${pts}" fill="none" ${stroke} ${dash}/>`;
      if (el.type === 'arrow' && (el.points?.length ?? 0) >= 2) {
        const pp = el.points!;
        const a = pp[pp.length - 2];
        const b = pp[pp.length - 1];
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const size = Math.max(12, el.strokeWidth * 3.5);
        const bx = x + b.x;
        const by = y + b.y;
        const x1 = bx - size * Math.cos(ang - Math.PI / 7);
        const y1 = by - size * Math.sin(ang - Math.PI / 7);
        const x2 = bx - size * Math.cos(ang + Math.PI / 7);
        const y2 = by - size * Math.sin(ang + Math.PI / 7);
        body += `<polyline points="${x1},${y1} ${bx},${by} ${x2},${y2}" fill="none" ${stroke}/>`;
      }
      break;
    }
    case 'draw': {
      const outline = freehandOutline(el.points ?? [], el.strokeWidth);
      if (outline.length) {
        const d = outline.map((p, i) => `${i === 0 ? 'M' : 'L'}${(x + p[0]).toFixed(2)} ${(y + p[1]).toFixed(2)}`).join(' ') + 'Z';
        const col = el.strokeColor === 'transparent' ? '#111111' : el.strokeColor;
        body = `<path d="${d}" fill="${col}"/>`;
      }
      break;
    }
    case 'image': {
      const href = el.fileId ? images.get(el.fileId) : undefined;
      const fstyle = el.filters ? ` style="filter:${imageFilterString(el.filters)}"` : '';
      if (href) body = `<image x="${x}" y="${y}" width="${w}" height="${h}" href="${href}" preserveAspectRatio="none"${fstyle}/>`;
      else body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f1f3f5" stroke="#ced4da"/>`;
      break;
    }
    case 'sticky':
    case 'text': {
      if (el.type === 'sticky') {
        body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${el.backgroundColor}"/>`;
      }
      if (el.text) {
        const mctx = getMeasureCtx();
        mctx.font = fontString(el);
        const pad = el.type === 'sticky' ? 14 : 0;
        const fs = el.fontSize ?? 20;
        const lh = fs * (el.lineHeight ?? 1.25);
        const family = FONT_STACKS[el.fontFamily ?? 'sans'];
        const align = el.textAlign ?? 'left';
        const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
        const tx = align === 'center' ? x + w / 2 : align === 'right' ? x + w - pad : x + pad;
        const color = el.type === 'sticky' ? '#27272a' : el.strokeColor;
        const baseY = (i: number) => y + pad + i * lh + fs * 0.85;
        let tspans = '';
        if (!el.list || el.list === 'none') {
          wrapText(mctx, el.text, w - pad * 2).forEach((ln, i) => {
            tspans += `<tspan x="${tx}" y="${baseY(i)}">${esc(ln)}</tspan>`;
          });
        } else {
          const paras = el.text.split('\n');
          let num = 1;
          let i = 0;
          for (const para of paras) {
            const prefix = el.list === 'bullet' ? '•  ' : `${num++}.  `;
            const indent = align === 'left' ? mctx.measureText(prefix).width : 0;
            const wrapped = wrapText(mctx, para, w - pad * 2 - indent);
            if (wrapped.length === 0) wrapped.push('');
            wrapped.forEach((ln, k) => {
              const txx = align === 'left' ? (k === 0 ? x + pad : x + pad + indent) : tx;
              tspans += `<tspan x="${txx}" y="${baseY(i)}">${esc(k === 0 ? prefix + ln : ln)}</tspan>`;
              i++;
            });
          }
        }
        const lsAttr = el.letterSpacing ? ` letter-spacing="${el.letterSpacing}"` : '';
        const textEl = `<text font-family="${esc(family)}" font-size="${fs}" font-weight="${el.fontWeight ?? 400}" font-style="${el.italic ? 'italic' : 'normal'}"${lsAttr} fill="${color}" text-anchor="${anchor}">${tspans}</text>`;
        // counter the group flip so glyphs stay readable
        body +=
          el.flipX || el.flipY
            ? `<g transform="translate(${c.x} ${c.y}) scale(${sx} ${sy}) translate(${-c.x} ${-c.y})">${textEl}</g>`
            : textEl;
      }
      break;
    }
  }
  return `${open}${defs ? `<defs>${defs}</defs>` : ''}${body}${close}`;
}

export async function buildSVG(
  elements: Element[],
  pad = 32,
  opts: { crop?: Bounds; background?: string | null } = {},
): Promise<string> {
  const visible = elements.filter((e) => !e.hidden);
  const p = opts.crop ? 0 : pad;
  const bounds = opts.crop ?? commonBounds(visible) ?? { x: 0, y: 0, width: 100, height: 100 };
  // image hrefs as data URLs
  const images = new Map<string, string>();
  await Promise.all(
    visible
      .filter((e) => e.type === 'image' && e.fileId)
      .map(async (e) => {
        const asset = await getAsset(e.fileId!);
        if (asset) images.set(e.fileId!, await blobToDataURL(asset.blob));
      }),
  );
  const W = bounds.width + p * 2;
  const H = bounds.height + p * 2;
  const vx = bounds.x - p;
  const vy = bounds.y - p;
  const bg = opts.background ?? '#ffffff';
  const clip = opts.crop
    ? `<clipPath id="crop"><rect x="${vx}" y="${vy}" width="${W}" height="${H}"/></clipPath>`
    : '';
  const inner = visible.map((e) => elementToSVG(e, images)).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${vx} ${vy} ${W} ${H}">
${clip ? `<defs>${clip}</defs>` : ''}
<rect x="${vx}" y="${vy}" width="${W}" height="${H}" fill="${bg}"/>
<g${clip ? ' clip-path="url(#crop)"' : ''}>${inner}</g>
</svg>`;
}

export async function exportSVG(elements: Element[], name: string, opts: ScopeOpts = {}) {
  const svg = await buildSVG(elements, 32, { crop: opts.crop, background: opts.background });
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${sanitizeFilename(name)}.svg`);
}

// ── HTML snapshot (single file, vector inside) ───────────────────────────────

export async function exportHTML(elements: Element[], name: string) {
  const svg = await buildSVG(elements);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(name)} — Slate snapshot</title>
<style>
  :root { color-scheme: light; }
  * { margin: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, system-ui, sans-serif; background: #f4f4f5; color: #111; min-height: 100vh; display: flex; flex-direction: column; }
  header { padding: 14px 20px; display:flex; align-items:center; gap:10px; border-bottom:1px solid #e4e4e7; background:#fff; }
  header b { font-weight:600; } header span { color:#a1a1aa; font-size:13px; }
  main { flex:1; display:flex; align-items:center; justify-content:center; padding: 32px; overflow:auto; }
  .frame { background:#fff; border:1px solid #e4e4e7; border-radius:12px; box-shadow:0 12px 40px rgba(0,0,0,.08); padding:8px; max-width:100%; }
  svg { max-width:100%; height:auto; display:block; }
</style></head>
<body>
  <header><b>${esc(name)}</b><span>· Slate whiteboard snapshot</span></header>
  <main><div class="frame">${svg}</div></main>
</body></html>`;
  downloadBlob(new Blob([html], { type: 'text/html' }), `${sanitizeFilename(name)}.html`);
}

// ── PDF (single page, embedded JPEG) ─────────────────────────────────────────

export async function exportPDF(elements: Element[], name: string, opts: ScopeOpts = {}) {
  const canvas = await renderToCanvas(elements, {
    background: opts.background ?? '#ffffff',
    scale: 2,
    crop: opts.crop,
  });
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const base64 = dataUrl.split(',')[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pdf = buildImagePDF(bytes, canvas.width, canvas.height);
  downloadBlob(new Blob([pdf as BlobPart], { type: 'application/pdf' }), `${sanitizeFilename(name)}.pdf`);
}

// ── per-frame export ─────────────────────────────────────────────────────────

export type FrameFormat = 'png' | 'jpg' | 'svg' | 'pdf';

export function frameChildren(frame: Element, all: Element[]): Element[] {
  return all.filter((e) => e.frameId === frame.id && !e.hidden);
}

export async function exportFrame(frame: Element, all: Element[], format: FrameFormat) {
  const children = frameChildren(frame, all);
  const opts: ScopeOpts = {
    crop: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    background: frame.backgroundColor,
  };
  const name = frame.name || 'frame';
  if (format === 'png') await exportPNG(children, name, opts);
  else if (format === 'jpg') await exportJPG(children, name, opts);
  else if (format === 'svg') await exportSVG(children, name, opts);
  else await exportPDF(children, name, opts);
}

export async function exportAllFrames(all: Element[], format: FrameFormat) {
  const frames = sortFrames(all);
  for (const f of frames) {
    await exportFrame(f, all, format);
    await new Promise((r) => setTimeout(r, 150)); // stagger browser downloads
  }
}

// Minimal single-image PDF writer (JPEG via DCTDecode). Page sized to the image.
function buildImagePDF(jpeg: Uint8Array, imgW: number, imgH: number): Uint8Array {
  // points: scale image to fit a sensible page width while keeping aspect
  const pageW = Math.min(imgW, 1000);
  const pageH = (imgH / imgW) * pageW;
  const enc = new TextEncoder();
  const chunks: (string | Uint8Array)[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: string | Uint8Array) => {
    const bin = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bin);
    length += bin.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };

  push('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(
      2,
    )}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  // image xobject (header written manually so we can append binary data)
  offsets[4] = length;
  push(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  push('\nendstream\nendobj\n');
  const content = `q ${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);

  const xrefPos = length;
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const ch of chunks) {
    const bin = ch as Uint8Array;
    out.set(bin, pos);
    pos += bin.length;
  }
  return out;
}

// ── .board file (self-contained JSON with embedded assets) ───────────────────

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dataURLToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const mime = head.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes as BlobPart], { type: mime });
}

interface BoardFile {
  type: 'slate-board';
  version: 1;
  name: string;
  elements: Element[];
  camera: Camera;
  assets: { id: string; dataURL: string; type: string; width: number; height: number }[];
  exportedAt: number;
}

export async function exportBoardFile(
  name: string,
  elements: Element[],
  camera: Camera,
): Promise<void> {
  const assets: BoardFile['assets'] = [];
  for (const el of elements) {
    if (el.type === 'image' && el.fileId) {
      const asset = await getAsset(el.fileId);
      if (asset) {
        assets.push({
          id: asset.id,
          dataURL: await blobToDataURL(asset.blob),
          type: asset.type,
          width: asset.width,
          height: asset.height,
        });
      }
    }
  }
  const file: BoardFile = {
    type: 'slate-board',
    version: 1,
    name,
    elements,
    camera,
    assets,
    exportedAt: Date.now(),
  };
  downloadBlob(
    new Blob([JSON.stringify(file)], { type: 'application/json' }),
    `${sanitizeFilename(name)}.board`,
  );
}

// Import a .board file: creates a new board record (+ assets) and returns its id.
export async function importBoardFile(file: File): Promise<string> {
  const text = await file.text();
  const data = JSON.parse(text) as BoardFile;
  if (data.type !== 'slate-board') throw new Error('Not a Slate .board file');

  // remap asset ids to avoid collisions
  const idMap = new Map<string, string>();
  for (const a of data.assets ?? []) {
    const newId = nanoid();
    idMap.set(a.id, newId);
    const rec: AssetRecord = {
      id: newId,
      blob: dataURLToBlob(a.dataURL),
      type: a.type,
      width: a.width,
      height: a.height,
      createdAt: Date.now(),
    };
    await saveAsset(rec);
  }
  const elements = data.elements.map((e) =>
    e.fileId && idMap.has(e.fileId) ? { ...e, fileId: idMap.get(e.fileId) } : e,
  );

  const boardId = nanoid();
  const record: BoardRecord = {
    id: boardId,
    name: data.name ? `${data.name} (imported)` : 'Imported board',
    elements,
    camera: data.camera ?? { x: 0, y: 0, zoom: 1 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    favorite: false,
    archived: false,
  };
  await saveBoard(record);
  return boardId;
}
