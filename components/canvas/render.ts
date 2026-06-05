import { ACCENT, FONT_STACKS, GRID_SIZE, HANDLE_SIZE, STICKY_COLORS, THEME } from '@/lib/constants';
import { freehandOutline } from '@/lib/freehand';
import { elementAABB, elementCenter, screenToWorld, worldToScreen } from '@/lib/geometry';
import type { Camera, CanvasBgStyle, Element } from '@/lib/types';
import type { SelectionFrame } from './handles';

export type ImageResolver = (fileId: string) => HTMLImageElement | undefined;

export interface SnapGuide {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// ── text helpers ─────────────────────────────────────────────────────────────

export function fontString(el: Element): string {
  const family = FONT_STACKS[el.fontFamily ?? 'sans'] ?? FONT_STACKS.sans;
  const style = el.italic ? 'italic ' : '';
  const weight = el.fontWeight ?? 400;
  return `${style}${weight} ${el.fontSize ?? 20}px ${family}`;
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  const paragraphs = text.split('\n');
  for (const para of paragraphs) {
    if (maxWidth <= 0 || para === '') {
      out.push(para);
      continue;
    }
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

function stickyTextColor(fill: string): string {
  const found = STICKY_COLORS.find((s) => s.fill.toLowerCase() === fill.toLowerCase());
  return found ? found.text : '#27272a';
}

// CSS-style filter string for image adjustments (also reused by SVG export).
export function imageFilterString(f: NonNullable<Element['filters']>): string {
  return (
    `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) ` +
    `grayscale(${f.grayscale}%) sepia(${f.sepia}%) blur(${f.blur}px)`
  );
}

// ── primitive paths ──────────────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ── element drawing ──────────────────────────────────────────────────────────

export function drawElement(
  ctx: CanvasRenderingContext2D,
  el: Element,
  getImage: ImageResolver,
  skipText = false,
) {
  if (el.hidden) return;
  ctx.save();
  ctx.globalAlpha = (el.opacity ?? 100) / 100;

  const c = elementCenter(el);
  ctx.translate(c.x, c.y);
  ctx.rotate(el.angle);
  if (el.flipX || el.flipY) ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
  ctx.translate(-c.x, -c.y);
  ctx.translate(el.x, el.y);

  const w = el.width;
  const h = el.height;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = el.strokeWidth;
  ctx.strokeStyle = el.strokeColor;

  if (el.strokeStyle === 'dashed') ctx.setLineDash([el.strokeWidth * 3, el.strokeWidth * 2.5]);
  else if (el.strokeStyle === 'dotted') ctx.setLineDash([0.1, el.strokeWidth * 2.2]);
  else ctx.setLineDash([]);

  // Resolve the fill paint: a gradient takes precedence over a solid color.
  let fillPaint: string | CanvasGradient | null =
    el.fillStyle === 'solid' && el.backgroundColor !== 'transparent' ? el.backgroundColor : null;
  if (el.gradient && el.gradient.stops.length >= 2) {
    const rad = (el.gradient.angle * Math.PI) / 180;
    const hx = (Math.cos(rad) * w) / 2;
    const hy = (Math.sin(rad) * h) / 2;
    const g = ctx.createLinearGradient(w / 2 - hx, h / 2 - hy, w / 2 + hx, h / 2 + hy);
    for (const st of [...el.gradient.stops].sort((a, b) => a.at - b.at)) {
      g.addColorStop(Math.max(0, Math.min(1, st.at)), st.color);
    }
    fillPaint = g;
  }
  const hasFill = fillPaint !== null;
  const hasStroke = el.strokeColor !== 'transparent' && el.strokeWidth > 0;

  // Fill the current path, applying the drop shadow to the fill only (a wrapping
  // save/restore keeps the shadow off the stroke and any text).
  const doFill = () => {
    if (!hasFill) return;
    ctx.save();
    if (el.shadow) {
      ctx.shadowOffsetX = el.shadow.x;
      ctx.shadowOffsetY = el.shadow.y;
      ctx.shadowBlur = el.shadow.blur;
      ctx.shadowColor = el.shadow.color;
    }
    ctx.fillStyle = fillPaint!;
    ctx.fill();
    ctx.restore();
  };

  switch (el.type) {
    case 'rectangle': {
      const r = (el.roundness ?? 0) * Math.min(Math.abs(w), Math.abs(h)) * 0.25;
      roundRect(ctx, 0, 0, w, h, r);
      doFill();
      if (hasStroke) ctx.stroke();
      break;
    }
    case 'frame': {
      const r = (el.roundness ?? 0) * Math.min(Math.abs(w), Math.abs(h)) * 0.25;
      roundRect(ctx, 0, 0, w, h, r);
      ctx.fillStyle = el.backgroundColor;
      ctx.fill();
      if (hasStroke) ctx.stroke();
      break;
    }
    case 'ellipse': {
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      doFill();
      if (hasStroke) ctx.stroke();
      break;
    }
    case 'diamond': {
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w, h / 2);
      ctx.lineTo(w / 2, h);
      ctx.lineTo(0, h / 2);
      ctx.closePath();
      doFill();
      if (hasStroke) ctx.stroke();
      break;
    }
    case 'triangle': {
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      doFill();
      if (hasStroke) ctx.stroke();
      break;
    }
    case 'line':
    case 'arrow': {
      const pts = el.points ?? [];
      if (pts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        if (el.type === 'arrow') {
          const a = pts[pts.length - 2];
          const b = pts[pts.length - 1];
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          const size = Math.max(12, el.strokeWidth * 3.5);
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x - size * Math.cos(ang - Math.PI / 7), b.y - size * Math.sin(ang - Math.PI / 7));
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x - size * Math.cos(ang + Math.PI / 7), b.y - size * Math.sin(ang + Math.PI / 7));
          ctx.stroke();
        }
      }
      break;
    }
    case 'draw': {
      const pts = el.points ?? [];
      const outline = freehandOutline(pts, el.strokeWidth);
      if (outline.length) {
        const path = new Path2D();
        path.moveTo(outline[0][0], outline[0][1]);
        for (let i = 1; i < outline.length; i++) path.lineTo(outline[i][0], outline[i][1]);
        path.closePath();
        ctx.fillStyle = el.strokeColor === 'transparent' ? '#111111' : el.strokeColor;
        ctx.fill(path);
      }
      break;
    }
    case 'image': {
      const img = el.fileId ? getImage(el.fileId) : undefined;
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        roundRect(ctx, 0, 0, w, h, 4);
        ctx.clip();
        if (el.filters) ctx.filter = imageFilterString(el.filters);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.restore();
      } else {
        ctx.fillStyle = '#f1f3f5';
        roundRect(ctx, 0, 0, w, h, 4);
        ctx.fill();
        ctx.strokeStyle = '#ced4da';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      break;
    }
    case 'sticky': {
      ctx.save();
      ctx.shadowColor = 'rgba(17,17,17,0.12)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = el.backgroundColor;
      roundRect(ctx, 0, 0, w, h, 6);
      ctx.fill();
      ctx.restore();
      if (!skipText && el.text) {
        drawFlippedText(ctx, el, stickyTextColor(el.backgroundColor), 14);
      }
      break;
    }
    case 'text': {
      if (!skipText && el.text) {
        drawFlippedText(ctx, el, el.strokeColor, 0);
      }
      break;
    }
  }

  ctx.restore();
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  el: Element,
  color: string,
  pad: number,
) {
  ctx.setLineDash([]);
  ctx.font = fontString(el);
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  const align = el.textAlign ?? 'left';
  ctx.textAlign = align;

  const supportsLS = 'letterSpacing' in ctx;
  const ls = el.letterSpacing ?? 0;
  if (supportsLS) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${ls}px`;

  const lineHeight = (el.fontSize ?? 20) * (el.lineHeight ?? 1.25);
  const baseX = align === 'center' ? el.width / 2 : align === 'right' ? el.width - pad : pad;
  const text = el.text ?? '';
  let y = pad;

  if (!el.list || el.list === 'none') {
    for (const ln of wrapText(ctx, text, el.width - pad * 2)) {
      ctx.fillText(ln, baseX, y);
      y += lineHeight;
    }
  } else {
    const paras = text.split('\n');
    let num = 1;
    for (const para of paras) {
      const prefix = el.list === 'bullet' ? '•  ' : `${num++}.  `;
      const indent = align === 'left' ? ctx.measureText(prefix).width : 0;
      const wrapped = wrapText(ctx, para, el.width - pad * 2 - indent);
      if (wrapped.length === 0) wrapped.push('');
      wrapped.forEach((ln, i) => {
        if (align === 'left') {
          ctx.fillText(i === 0 ? prefix + ln : ln, i === 0 ? pad : pad + indent, y);
        } else {
          ctx.fillText(i === 0 ? prefix + ln : ln, baseX, y);
        }
        y += lineHeight;
      });
    }
  }

  if (supportsLS) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
}

// Keep glyphs readable when the element is flipped (the element-level scale is
// counter-applied around the text box).
function drawFlippedText(ctx: CanvasRenderingContext2D, el: Element, color: string, pad: number) {
  if (!el.flipX && !el.flipY) {
    drawTextBlock(ctx, el, color, pad);
    return;
  }
  ctx.save();
  ctx.translate(el.flipX ? el.width : 0, el.flipY ? el.height : 0);
  ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
  drawTextBlock(ctx, el, color, pad);
  ctx.restore();
}

// ── background pattern ─────────────────────────────────────────────────────────

function drawBackgroundPattern(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  width: number,
  height: number,
  style: CanvasBgStyle,
  theme: 'light' | 'dark',
) {
  if (style === 'solid') return;
  let step = GRID_SIZE;
  // keep spacing readable across zoom levels
  while (step * camera.zoom < 14) step *= 2;
  while (step * camera.zoom > 90) step /= 2;
  const tl = screenToWorld({ x: 0, y: 0 }, camera);
  const br = screenToWorld({ x: width, y: height }, camera);
  const startX = Math.floor(tl.x / step) * step;
  const startY = Math.floor(tl.y / step) * step;
  const colors = THEME[theme];

  if (style === 'dots') {
    ctx.fillStyle = colors.gridDot;
    const dot = camera.zoom > 1.5 ? 1.4 : 1;
    for (let x = startX; x < br.x; x += step) {
      for (let y = startY; y < br.y; y += step) {
        const s = worldToScreen({ x, y }, camera);
        ctx.beginPath();
        ctx.arc(s.x, s.y, dot, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }

  // grid / lines
  ctx.strokeStyle = colors.gridLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = startY; y < br.y; y += step) {
    const s = worldToScreen({ x: tl.x, y }, camera);
    const e = worldToScreen({ x: br.x, y }, camera);
    ctx.moveTo(s.x, Math.round(s.y) + 0.5);
    ctx.lineTo(e.x, Math.round(e.y) + 0.5);
  }
  if (style === 'grid') {
    for (let x = startX; x < br.x; x += step) {
      const s = worldToScreen({ x, y: tl.y }, camera);
      const e = worldToScreen({ x, y: br.y }, camera);
      ctx.moveTo(Math.round(s.x) + 0.5, s.y);
      ctx.lineTo(Math.round(e.x) + 0.5, e.y);
    }
  }
  ctx.stroke();
}

// ── selection overlay ────────────────────────────────────────────────────────

function drawSelection(ctx: CanvasRenderingContext2D, frame: SelectionFrame) {
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ACCENT;
  ctx.setLineDash([]);
  const [nw, ne, se, sw] = frame.corners;
  ctx.beginPath();
  ctx.moveTo(nw.x, nw.y);
  ctx.lineTo(ne.x, ne.y);
  ctx.lineTo(se.x, se.y);
  ctx.lineTo(sw.x, sw.y);
  ctx.closePath();
  ctx.stroke();

  for (const h of frame.handles) {
    if (h.type === 'rotate') {
      // connector line to top edge
      const nMid = { x: (nw.x + ne.x) / 2, y: (nw.y + ne.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(nMid.x, nMid.y);
      ctx.lineTo(h.x, h.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(h.x, h.y, HANDLE_SIZE / 2 + 1, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.stroke();
    } else {
      const s = HANDLE_SIZE;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.rect(h.x - s / 2, h.y - s / 2, s, s);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawHover(ctx: CanvasRenderingContext2D, el: Element, camera: Camera) {
  const b = elementAABB(el);
  const tl = worldToScreen({ x: b.x, y: b.y }, camera);
  const w = b.width * camera.zoom;
  const h = b.height * camera.zoom;
  ctx.save();
  ctx.strokeStyle = ACCENT;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.strokeRect(tl.x - 1, tl.y - 1, w + 2, h + 2);
  ctx.restore();
}

// ── scene ────────────────────────────────────────────────────────────────────

export interface SceneParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  camera: Camera;
  elements: Element[];
  getImage: ImageResolver;
  grid: boolean;
  selectedIds: string[];
  hoveredId: string | null;
  editingId: string | null;
  selectionFrame: SelectionFrame | null;
  marquee: { x: number; y: number; width: number; height: number } | null;
  snapGuides: SnapGuide[];
  bindHighlight?: string | null;
  background?: string;
  bgStyle?: CanvasBgStyle;
  theme?: 'light' | 'dark';
}

export function renderScene(p: SceneParams) {
  const { ctx, width, height, dpr, camera } = p;
  const theme = p.theme ?? 'light';

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = p.background ?? THEME[theme].canvas;
  ctx.fillRect(0, 0, width, height);

  if (p.grid) drawBackgroundPattern(ctx, camera, width, height, p.bgStyle ?? 'dots', theme);

  // world space
  ctx.setTransform(
    camera.zoom * dpr,
    0,
    0,
    camera.zoom * dpr,
    -camera.x * camera.zoom * dpr,
    -camera.y * camera.zoom * dpr,
  );

  // viewport cull bounds (world)
  const tl = screenToWorld({ x: 0, y: 0 }, camera);
  const br = screenToWorld({ x: width, y: height }, camera);
  const cullPad = 64 / camera.zoom;
  const inView = (el: Element) => {
    const b = elementAABB(el);
    return !(
      b.x > br.x + cullPad ||
      b.x + b.width < tl.x - cullPad ||
      b.y > br.y + cullPad ||
      b.y + b.height < tl.y - cullPad
    );
  };

  // group children under their frame so they render clipped, in z-order
  const frameIds = new Set(p.elements.filter((e) => e.type === 'frame').map((e) => e.id));
  const kidsByFrame = new Map<string, Element[]>();
  if (frameIds.size) {
    for (const e of p.elements) {
      if (e.frameId && frameIds.has(e.frameId)) {
        const arr = kidsByFrame.get(e.frameId);
        if (arr) arr.push(e);
        else kidsByFrame.set(e.frameId, [e]);
      }
    }
  }

  for (const el of p.elements) {
    if (el.hidden) continue;
    if (el.frameId && frameIds.has(el.frameId)) continue; // drawn with its frame
    if (el.type === 'frame') {
      if (inView(el)) drawElement(ctx, el, p.getImage, el.id === p.editingId);
      const kids = kidsByFrame.get(el.id);
      if (kids && kids.length) {
        ctx.save();
        const r = (el.roundness ?? 0) * Math.min(el.width, el.height) * 0.25;
        roundRect(ctx, el.x, el.y, el.width, el.height, r);
        ctx.clip();
        for (const ch of kids) {
          if (ch.hidden || !inView(ch)) continue;
          drawElement(ctx, ch, p.getImage, ch.id === p.editingId);
        }
        ctx.restore();
      }
    } else if (inView(el)) {
      drawElement(ctx, el, p.getImage, el.id === p.editingId);
    }
  }

  // overlay (screen space)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // frame labels (constant size, above content)
  if (frameIds.size) {
    ctx.font = `600 12px ${FONT_STACKS.sans}`;
    ctx.fillStyle = theme === 'dark' ? 'rgba(245,245,245,0.6)' : 'rgba(17,17,17,0.5)';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    for (const el of p.elements) {
      if (el.type !== 'frame' || el.hidden) continue;
      const s = worldToScreen({ x: el.x, y: el.y }, camera);
      ctx.fillText(el.name || 'Frame', s.x + 1, s.y - 5);
    }
  }

  if (p.hoveredId && !p.selectedIds.includes(p.hoveredId)) {
    const el = p.elements.find((e) => e.id === p.hoveredId);
    if (el) drawHover(ctx, el, camera);
  }

  if (p.bindHighlight) {
    const el = p.elements.find((e) => e.id === p.bindHighlight);
    if (el) {
      const b = elementAABB(el);
      const tl = worldToScreen({ x: b.x, y: b.y }, camera);
      ctx.save();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(tl.x - 2.5, tl.y - 2.5, b.width * camera.zoom + 5, b.height * camera.zoom + 5);
      ctx.restore();
    }
  }

  for (const g of p.snapGuides) {
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(g.x1, g.y1);
    ctx.lineTo(g.x2, g.y2);
    ctx.stroke();
    ctx.restore();
  }

  if (p.selectionFrame) drawSelection(ctx, p.selectionFrame);

  if (p.marquee) {
    ctx.save();
    ctx.fillStyle = 'rgba(91,108,255,0.08)';
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.fillRect(p.marquee.x, p.marquee.y, p.marquee.width, p.marquee.height);
    ctx.strokeRect(p.marquee.x, p.marquee.y, p.marquee.width, p.marquee.height);
    ctx.restore();
  }
}
