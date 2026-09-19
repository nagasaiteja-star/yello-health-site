// Render an HTML deck into page images for the investor room (p01.png, p02.png…).
// Local only. Output goes OUTSIDE the repo (the repo is public on GitHub Pages).
//   node tools/render-pages.mjs <deck.html> <out-dir> [selector=section] [width=1600] [height=900]
// Then upload the PNGs into Drive: "Yello Investor Room/docs/<doc-id>/" and run
// Yello Room → Publish doc from folder… in the Sheet.
// PDFs: export slide PNGs from the source app (Keynote / Google Slides → Download → PNG) instead.
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/Users/nstg/Documents/Codex/yello-deck-build/package.json');
const puppeteer = require('puppeteer-core');

const [src, out, selector = 'section', w = '1600', h = '900'] = process.argv.slice(2);
if (!src || !out) { console.error('usage: node tools/render-pages.mjs <deck.html> <out-dir> [selector] [width] [height]'); process.exit(1); }
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
if (path.resolve(out).startsWith(repo)) { console.error('Refusing to write inside the public site repo. Pick a scratch folder.'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: +w, height: +h, deviceScaleFactor: 1.5 });
await p.goto('file://' + path.resolve(src), { waitUntil: 'networkidle0' });
await p.evaluateHandle('document.fonts.ready');
await p.emulateMediaType('screen');
const els = await p.$$(selector);
if (!els.length) { console.error('No elements match "' + selector + '"'); await b.close(); process.exit(1); }
let n = 0;
for (const el of els) {
  const box = await el.boundingBox();
  if (!box || box.height < 50) continue;
  n++;
  await el.screenshot({ path: path.join(out, 'p' + String(n).padStart(2, '0') + '.png') });
}
await b.close();
console.log(n + ' pages → ' + out);
