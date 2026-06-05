// Generates PWA icons as PNGs with no external dependencies (pure Node + zlib).
// Draws an accent rounded-square app icon with a white mark, plus a maskable
// variant. Runs automatically via the predev/prebuild npm hooks.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const ACCENT = [0x5b, 0x6c, 0xff];
const WHITE = [0xff, 0xff, 0xff];

// signed distance to a rounded rectangle (negative inside)
function rrCoverage(px, py, x, y, w, h, r) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const hw = w / 2;
  const hh = h / 2;
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  const d = outside + inside - r;
  return Math.max(0, Math.min(1, 0.5 - d));
}

function over(buf, i, rgb, a) {
  const ia = 1 - a;
  buf[i] = Math.round(rgb[0] * a + buf[i] * ia);
  buf[i + 1] = Math.round(rgb[1] * a + buf[i + 1] * ia);
  buf[i + 2] = Math.round(rgb[2] * a + buf[i + 2] * ia);
  buf[i + 3] = Math.max(buf[i + 3], Math.round(a * 255));
}

function drawIcon(size, markFraction) {
  const buf = Buffer.alloc(size * size * 4);
  const radius = size * 0.225;
  const mw = size * markFraction;
  const mx = (size - mw) / 2;
  const mr = mw * 0.3;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cov = rrCoverage(x + 0.5, y + 0.5, 0, 0, size, size, radius);
      buf[i] = ACCENT[0];
      buf[i + 1] = ACCENT[1];
      buf[i + 2] = ACCENT[2];
      buf[i + 3] = Math.round(cov * 255);
      const m = rrCoverage(x + 0.5, y + 0.5, mx, mx, mw, mw, mr);
      if (m > 0 && buf[i + 3] > 0) over(buf, i, WHITE, m * 0.95);
    }
  }
  return buf;
}

// ── PNG encoding ──────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function write(name, size, markFraction) {
  const png = encodePNG(size, drawIcon(size, markFraction));
  writeFileSync(join(outDir, name), png);
}

write('icon-192.png', 192, 0.42);
write('icon-512.png', 512, 0.42);
write('maskable-512.png', 512, 0.34);

console.log('✓ generated PWA icons in public/icons');
