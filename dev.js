// Local server: static files from public/ plus the same API that runs on Vercel.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { handle } from './lib/router.js';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const port = Number(process.env.PORT || 4300);
createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path.startsWith('/api/')) return handle(req, res);
  const file = path === '/' ? 'index.html' : path === '/app' || path === '/app/' ? 'app.html' : normalize(path).replace(/^\/+/, '');
  try { const data = await readFile(join('public', file)); res.setHeader('content-type', types[extname(file)] || 'application/octet-stream'); res.end(data); }
  catch { res.statusCode = 404; res.end('Не найдено'); }
}).listen(port, () => console.log(`Норма: http://localhost:${port}`));
