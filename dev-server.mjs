// Zero-dependency local server: serves the static files and runs api/*.js the way
// Vercel does (req, res with status()/json()). `npm run dev` → http://localhost:3000
// (`vercel dev` works too, if you have the Vercel CLI.)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const port = Number(process.env.PORT) || 3000;
const types = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
  try {
    const api = path.match(/^\/api\/([a-z-]+)$/);
    if (api) {
      const mod = await import(join(root, 'api', `${api[1]}.js`) + `?t=${Date.now()}`);
      return await mod.default(req, res);
    }
    const file = normalize(join(root, path === '/' ? 'index.html' : path));
    if (!file.startsWith(root) || file.includes('/.')) return res.status(404).end('Not found');
    const body = await readFile(file);
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch (e) {
    if (!res.headersSent) res.status(e.code === 'ENOENT' || e.code === 'ERR_MODULE_NOT_FOUND' ? 404 : 500).end(String(e.message));
  }
}).listen(port, () => console.log(`Snow forecast on http://localhost:${port}`));
