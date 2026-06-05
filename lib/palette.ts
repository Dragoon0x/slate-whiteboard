import { getAsset } from './storage';

type RGB = [number, number, number];

function channelRange(box: RGB[], ch: number): number {
  let min = 255;
  let max = 0;
  for (const p of box) {
    if (p[ch] < min) min = p[ch];
    if (p[ch] > max) max = p[ch];
  }
  return max - min;
}

function boxVolume(box: RGB[]): number {
  return channelRange(box, 0) * channelRange(box, 1) * channelRange(box, 2);
}

function longestChannel(box: RGB[]): number {
  const r = channelRange(box, 0);
  const g = channelRange(box, 1);
  const b = channelRange(box, 2);
  return r >= g && r >= b ? 0 : g >= b ? 1 : 2;
}

function average(box: RGB[]): RGB {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const p of box) {
    r += p[0];
    g += p[1];
    b += p[2];
  }
  const n = box.length || 1;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

// Median-cut quantization → ~`count` representative colors.
function medianCut(pixels: RGB[], count: number): RGB[] {
  let boxes: RGB[][] = [pixels];
  while (boxes.length < count) {
    boxes.sort((a, b) => boxVolume(b) - boxVolume(a));
    const box = boxes.shift();
    if (!box || box.length < 2) {
      if (box) boxes.push(box);
      break;
    }
    const ch = longestChannel(box);
    box.sort((a, b) => a[ch] - b[ch]);
    const mid = box.length >> 1;
    boxes.push(box.slice(0, mid), box.slice(mid));
  }
  return boxes.map(average);
}

function toHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Extract a small color palette from an image asset.
export async function extractPalette(fileId: string, count = 6): Promise<string[]> {
  const asset = await getAsset(fileId);
  if (!asset) return [];
  const bmp = await createImageBitmap(asset.blob).catch(() => null);
  if (!bmp) return [];

  const target = 72;
  const scale = Math.min(1, target / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();

  const { data } = ctx.getImageData(0, 0, w, h);
  const pixels: RGB[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 125) continue; // skip mostly-transparent
    // light quantization to merge near-identical pixels
    pixels.push([data[i] & 0xf8, data[i + 1] & 0xf8, data[i + 2] & 0xf8]);
  }
  if (pixels.length === 0) return [];

  const colors = medianCut(pixels, count).map(toHex);
  // de-duplicate while keeping order
  return Array.from(new Set(colors));
}
