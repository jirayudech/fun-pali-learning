import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const files = ['index.html', 'app.js', 'oauth.js', 'art.js', 'pali-script.js', 'pairing.js', 'grammar.js', 'game-engine.js', 'game-ui.js', 'exam-ui.js', 'exam-engine.js', 'exam-data.js', 'exam-archive.js', 'exam-lessons.js', 'chant-ui.js', 'chant-engine.js', 'chant-audio.js', 'chant-content.js', 'style.css', 'config.js', 'lessons.js', 'favicon.svg'];
http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = pathname === '/' || pathname === '/fun-pali-learning/' ? 'index.html' : pathname.replace(/^\/fun-pali-learning\//, '').replace(/^\//, '');
  const isArt = /^assets\/(exam|kathina|guide|garden|trophy|sounds|words|sentences|noun-roles|cases|number|verbs|pronouns|grammar-review|community|cheer|thinking|masculine|dative|genitive)(-pollinations)?\.(svg|png|jpg|webp)$/.test(file);
  if (!files.includes(file) && !isArt) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const content = await readFile(resolve(root, file));
    res.writeHead(200, { 'Content-Type': `${types[file.slice(file.lastIndexOf('.'))]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(content);
  } catch { res.writeHead(500); res.end('Cannot read file'); }
}).listen(Number(process.env.PORT || 4173), '0.0.0.0', () => console.log('Pali learning development server ready'));
