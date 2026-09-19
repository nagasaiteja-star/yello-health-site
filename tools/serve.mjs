// Local static server for yello-health-site (mirrors GitHub Pages: dir → index.html, 404.html on miss).
//   node tools/serve.mjs   → http://localhost:4185
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4185);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.xml': 'application/xml', '.txt': 'text/plain' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || /\/(\.git|apps-script|tools|docs)(\/|$)/.test(p)) f = '';
  else if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
    if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
    f = path.join(f, 'index.html');
  }
  if (f && !fs.existsSync(f) && !path.extname(f) && fs.existsSync(f + '.html')) f += '.html'; // GitHub Pages: /about → about.html
  const ok = f && fs.existsSync(f);
  const file = ok ? f : path.join(ROOT, '404.html');
  res.writeHead(ok ? 200 : 404, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('yello-health-site on http://localhost:' + PORT));
