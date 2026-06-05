// Tiny zero-dependency static file server for previewing the exported build.
// Handles clean URLs (/board -> board.html) so client routing works offline.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = process.argv[2] || 'out';
const PORT = Number(process.argv[3] || 4321);
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.ico': 'image/x-icon',
};

async function tryFile(p) {
  try {
    const s = await stat(p);
    if (s.isFile()) return p;
  } catch {
    /* not a file */
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = decodeURIComponent(url.pathname);
  let file =
    (await tryFile(join(ROOT, path))) ||
    (await tryFile(join(ROOT, `${path}.html`))) ||
    (await tryFile(join(ROOT, path, 'index.html')));
  if (!file) file = await tryFile(join(ROOT, '404.html'));
  if (!file) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  const body = await readFile(file);
  res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
  res.setHeader('Service-Worker-Allowed', '/');
  res.end(body);
}).listen(PORT, () => console.log(`Slate running at http://localhost:${PORT}`));
