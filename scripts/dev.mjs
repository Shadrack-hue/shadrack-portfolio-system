import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import handler from '../api/search.js';
const root = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/search') {
    const result = await handler.fetch(new Request(url, { method: req.method, headers: req.headers }));
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(await result.text()); return;
  }
  const file = resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root + '/')) { res.writeHead(403); res.end(); return; }
  try { res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }); res.end(await readFile(file)); }
  catch { res.writeHead(404); res.end('Not found'); }
}).listen(4173, '0.0.0.0', () => console.log('IntelStream: http://localhost:4173/intelstream.html'));
