import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const files = ['index.html', 'app.js', 'style.css', 'config.js', 'lessons.js', 'favicon.svg'];
http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = pathname === '/' || pathname === '/fun-pali-learning/' ? 'index.html' : pathname.replace(/^\/fun-pali-learning\//, '').replace(/^\//, '');
  if (!files.includes(file)) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const content = await readFile(resolve(root, file));
    res.writeHead(200, { 'Content-Type': `${types[file.slice(file.lastIndexOf('.'))]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(content);
  } catch { res.writeHead(500); res.end('Cannot read file'); }
}).listen(Number(process.env.PORT || 4173), '0.0.0.0', () => console.log('Pali learning development server ready'));
