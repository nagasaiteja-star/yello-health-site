// Local stand-in for the Apps Script APIs: investor room (apps-script/investor-room) and patient requests (apps-script/patient-requests).
// Same actions, same error codes, in memory. For local testing only — never deployed.
//   node tools/mock-room-api.mjs            → http://localhost:4181/api
//   GET  /state                             → dump Links / NDA / Views / Requests
//   POST /admin/revoke?k=<token>            → revoke a link (test the kill switch)
//   POST /admin/block?e=<email or @domain>  → block list (cuts live sessions too)
// Seed links: demo (test@example.com, passcode 1234, downloads on) · open (* any email) · firm (* but only @fund.test) ·
//             preview (founder@yello.test, sees drafts) · revoked · expired
// The HTML doc is the real deck read from disk (MOCK_HTML_DOC env to override) — local only.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';

const PORT = Number(process.env.PORT || 4181);
const NDA_VERSION = 'CONF-v2 (2026-09-24)';
const HTML_DOC = process.env.MOCK_HTML_DOC || new URL('../../NDIAN-Investor-Presentation-16Cr.html', import.meta.url).pathname;
const day = 86400000;
const db = {
  links: [
    { token: 'demo', investor: 'Test Investor', firm: 'Test Fund', email: 'test@example.com', passcode: '1234', docs: 'all', expires: '', status: 'active', opens: 0, first_open: '', download: 'Y' },
    { token: 'open', investor: '', firm: '', email: '*', passcode: '', docs: 'deck', expires: '', status: 'active', opens: 0, first_open: '' },
    { token: 'firm', investor: '', firm: 'Fund', email: '*', passcode: '', docs: 'all', expires: '', status: 'active', opens: 0, first_open: '', allow: '@fund.test' },
    { token: 'preview', investor: 'Preview (founders)', firm: 'Yello', email: 'founder@yello.test', passcode: '', docs: 'all', expires: '', status: 'active', opens: 0, first_open: '', download: 'Y', preview: 'Y' },
    { token: 'revoked', investor: 'Old', email: 'old@example.com', passcode: '', docs: 'all', expires: '', status: 'revoked', opens: 0 },
    { token: 'expired', investor: 'Late', email: 'late@example.com', passcode: '', docs: 'all', expires: new Date(Date.now() - day).toISOString(), status: 'active', opens: 0 },
  ],
  docs: [
    { doc: 'deck', title: 'Investor presentation (DUMMY)', pages: 3, published: true, legal: false, type: 'images', folder: 'Pitch', order: 2 },
    { doc: 'live', title: 'Investor presentation — live', pages: 11, published: true, legal: false, type: 'html', folder: 'Pitch', order: 1 },
    { doc: 'terms', title: 'Round terms (DUMMY)', pages: 2, published: true, legal: true, type: 'images', folder: 'Round terms', order: 3 },
    { doc: 'draft', title: 'Unpublished draft', pages: 1, published: false, legal: false, type: 'images', folder: 'Diligence', order: 4 },
  ],
  nda: [], views: [], requests: [], alerts: [], leads: [], visits: [], questions: [], downloads: [], blocklist: [],
};
const sessions = new Map(), fails = new Map();

const svgPage = (doc, n) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#fffdf7"/>` +
  `<rect x="0" y="0" width="1600" height="14" fill="#ffc40c"/><text x="90" y="200" font-family="Barlow,Arial" font-weight="800" font-size="84" fill="#242424">${doc.title}</text>` +
  `<text x="90" y="300" font-family="Barlow,Arial" font-size="44" fill="#6a6d73">Page ${n} of ${doc.pages} — dummy content for testing</text>` +
  `<text x="1500" y="840" text-anchor="end" font-family="Arial" font-size="120" font-weight="800" fill="#0f766e">${n}</text></svg>`).toString('base64');

const email = s => { s = String(s || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s === '*' ? s : ''; };
const link = k => db.links.find(l => l.token === String(k || ''));
const problem = l => !l ? 'link_not_found' : l.status !== 'active' ? 'link_revoked' : (l.expires && new Date(l.expires) < new Date()) ? 'link_expired' : '';
const yes = v => /^(y|yes|true|1)$/i.test(String(v ?? '').trim()) || v === true;
const allowed = l => { const a = String(l.docs || 'all').split(',').map(s => s.trim());
  return db.docs.filter(d => (d.published || yes(l.preview)) && (a.includes('all') || a.includes(d.doc))).sort((x, y) => x.order - y.order); };
const inList = (list, e) => { const items = String(list || '').toLowerCase().split(/[,\s]+/).filter(Boolean); if (!items.length) return true;
  const dom = e.split('@')[1]; return items.some(i => i === e || (i[0] === '@' ? i.slice(1) === dom : i === dom)); };
const blocked = e => !!e && e !== '*' && db.blocklist.length > 0 && inList(db.blocklist.join(','), e);
function session(sid, needNda) {
  const s = sessions.get(sid); if (!s) return { ok: false, error: 'session_expired' };
  const l = link(s.token), bad = problem(l); if (bad) return { ok: false, error: bad };
  if (blocked(s.email)) return { ok: false, error: 'email_blocked' };
  if (needNda && !s.nda) return { ok: false, error: 'nda_required' };
  return { ...s, link: l };
}

const api = {
  // patient-requests endpoint (apps-script/patient-requests) — same shape
  lead(r) { if (r.website) return { ok: true };
    if (r.type === 'booking' && (!r.name || String(r.mobile || '').replace(/\D/g, '').length < 10)) return { ok: false, error: 'missing_fields' };
    const ref = 'Y' + Math.random().toString(36).slice(2, 6).toUpperCase(); const { fileData, ...rest } = r;
    db.leads.push({ ts: new Date(), ref, ...rest, fileBytes: fileData ? fileData.length : 0 }); return { ok: true, ref }; },
  request(r) { if (r.website) return { ok: true }; if (!r.name || !email(r.email)) return { ok: false, error: 'missing_fields' };
    db.requests.push({ ts: new Date(), ...r }); db.alerts.push('request ' + r.email); return { ok: true }; },
  open(r) { const l = link(r.k), bad = problem(l); if (bad) return { ok: false, error: bad };
    return { ok: true, needsEmail: true, needsPasscode: !!l.passcode, investor: l.email === '*' ? '' : l.investor, ndaVersion: NDA_VERSION }; },
  verify(r) { const l = link(r.k), bad = problem(l); if (bad) return { ok: false, error: bad };
    const f = fails.get(l.token) || 0; if (f >= 10) return { ok: false, error: 'too_many_attempts' };
    const e = email(r.email); if (blocked(e)) return { ok: false, error: 'email_blocked' };
    const emailOk = e && e !== '*' && (l.email === '*' ? inList(l.allow, e) : l.email === e), passOk = !l.passcode || String(r.passcode || '').trim() === l.passcode;
    if (!emailOk || !passOk) { fails.set(l.token, f + 1);
      if (e && l.email === '*' && !inList(l.allow, e)) return { ok: false, error: 'email_not_allowed' };
      return { ok: false, error: !emailOk ? 'email_mismatch' : 'wrong_passcode' }; }
    const nda = db.nda.some(n => n.token === l.token && n.email === e && n.version === NDA_VERSION);
    const s = crypto.randomUUID(); sessions.set(s, { token: l.token, email: e, nda });
    if (!l.first_open) l.first_open = new Date(); l.opens++;
    return { ok: true, s, email: e, ndaDone: nda, ndaVersion: NDA_VERSION }; },
  nda(r) { const s = session(r.s); if (s.error) return s; if (!String(r.name || '').trim() || r.agree !== true) return { ok: false, error: 'nda_required' };
    db.nda.push({ ts: new Date(), token: s.token, name: r.name, email: s.email, version: NDA_VERSION }); sessions.get(r.s).nda = true; return { ok: true }; },
  docs(r) { const s = session(r.s, true); if (s.error) return s;
    return { ok: true, docs: allowed(s.link).map(d => ({ doc: d.doc, title: d.title, pages: d.pages, legal: d.legal, type: d.type, folder: d.folder, order: d.order, draft: !d.published })),
             investor: s.link.investor || '', email: s.email, download: yes(s.link.download) }; },
  visit(r) { const s = session(r.s); if (s.error) return s; if (db.visits.some(v => v.session === r.s)) return { ok: true };
    const prior = db.visits.filter(v => v.token === s.token && v.email === s.email).length;
    db.visits.push({ ts: new Date(), token: s.token, email: s.email, session: r.s, ...(r.info || {}) });
    db.alerts.push((prior ? 'return visit ' : 'first open ') + s.email + ' — ' + [r.info?.city, r.info?.country].filter(Boolean).join(', ')); return { ok: true }; },
  html(r) { const s = session(r.s, true); if (s.error) return s; const d = allowed(s.link).find(x => x.doc === r.doc);
    if (!d || d.type !== 'html') return { ok: false, error: 'doc_not_allowed' };
    return { ok: true, pages: d.pages, html: fs.readFileSync(HTML_DOC, 'utf8') }; },
  ask(r) { const s = session(r.s, true); if (s.error) return s; const kind = r.kind === 'feedback' ? 'feedback' : 'question';
    if (kind === 'question' && !String(r.text || '').trim()) return { ok: false, error: 'empty_question' };
    if (r.doc && !allowed(s.link).some(x => x.doc === r.doc)) return { ok: false, error: 'doc_not_allowed' };
    db.questions.push({ ts: new Date(), email: s.email, doc: r.doc, page: r.page, kind, rating: r.rating || '', text: r.text || '' });
    db.alerts.push(kind + ' from ' + s.email + ' (reply-to ' + s.email + ')'); return { ok: true }; },
  download(r) { const s = session(r.s, true); if (s.error) return s; if (!yes(s.link.download)) return { ok: false, error: 'download_off' };
    const d = allowed(s.link).find(x => x.doc === r.doc); if (!d) return { ok: false, error: 'doc_not_allowed' };
    const format = d.type === 'html' ? 'html' : 'pdf'; db.downloads.push({ ts: new Date(), email: s.email, doc: d.doc, format }); db.alerts.push('download ' + s.email + ' ' + d.doc);
    return { ok: true, format }; },
  page(r) { const s = session(r.s, true); if (s.error) return s; const d = allowed(s.link).find(x => x.doc === r.doc && x.type !== 'html');
    if (!d) return { ok: false, error: 'doc_not_allowed' }; const n = Math.floor(+r.page); if (!(n >= 1 && n <= d.pages)) return { ok: false, error: 'bad_page' };
    return { ok: true, page: n, pages: d.pages, mime: 'image/svg+xml', data: svgPage(d, n) }; },
  beat(r) { const s = session(r.s, true); if (s.error) return s; const secs = Math.max(0, Math.min(30, Math.round(+r.secs || 0)));
    if (!secs) return { ok: true }; if (!allowed(s.link).some(x => x.doc === r.doc)) return { ok: false, error: 'doc_not_allowed' };
    const v = db.views.find(x => x.session === r.s && x.doc === r.doc && x.page === +r.page);
    if (v) { v.seconds += secs; v.last_seen = new Date(); } else db.views.push({ first_seen: new Date(), last_seen: new Date(), token: s.token, email: s.email, doc: r.doc, page: +r.page, seconds: secs, session: r.s });
    return { ok: true }; },
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(obj, null, 1)); };
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }
  if (req.method === 'GET' && url.pathname === '/state') return send(200, { links: db.links, nda: db.nda, views: db.views, requests: db.requests, alerts: db.alerts, leads: db.leads,
    visits: db.visits, questions: db.questions, downloads: db.downloads, blocklist: db.blocklist });
  if (req.method === 'POST' && url.pathname === '/admin/block') { const e = String(url.searchParams.get('e') || '').toLowerCase(); if (e) db.blocklist.push(e); return send(200, { ok: !!e }); }
  if (req.method === 'POST' && url.pathname === '/admin/revoke') { const l = link(url.searchParams.get('k')); if (l) l.status = 'revoked'; return send(200, { ok: !!l }); }
  if (req.method === 'POST' && url.pathname === '/api') {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      let r; try { r = JSON.parse(body || '{}'); } catch { return send(200, { ok: false, error: 'bad_json' }); }
      const fn = api[r.action]; send(200, fn ? fn(r) : { ok: false, error: 'unknown_action' });
    }); return;
  }
  send(404, { ok: false, error: 'not_found' });
}).listen(PORT, () => console.log('mock room API on http://localhost:' + PORT + '/api'));
