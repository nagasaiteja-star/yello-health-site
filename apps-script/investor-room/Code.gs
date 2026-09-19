/**
 * Yello Investor Room — JSON API (Papermark-style data room on Apps Script).
 *
 * Bound to the Google Sheet "Yello Investor Room" (owner admin@studiocahaya.com).
 * The static viewer at yello.health/room/?k=<token> and the request form at
 * yello.health/investors/ call this web app with POST text/plain JSON (no CORS
 * preflight). Documents are PNG page images in Drive — never in the public repo.
 *
 * Checks on every page fetch: session live (CacheService, 6 h) → link active,
 * not expired → NDA accepted → doc published and allowed for this link.
 * Revoking a link in the Sheet cuts access on the very next request.
 *
 * DEPLOY: Web app · Execute as Me · Access Anyone. Redeploy = new VERSION of
 * the same deployment (keeps the /exec URL). See README-Deploy.md.
 */

const ROOM = {
  ROOT_FOLDER: 'Yello Investor Room',
  NDA_VERSION: 'CONF-v1 (2026-09-19)',
  SESSION_SECS: 21600,              // 6 h, CacheService max
  MAX_VERIFY_FAILS: 10,             // per link per hour
  TABS: {
    Links:    ['token','investor','firm','email','passcode','docs','expires','status','created','first_open','last_open','opens','notes'],
    Requests: ['ts','name','email','firm','type','link','note','status','token'],
    NDA:      ['ts','token','name','email','version'],
    Views:    ['first_seen','last_seen','token','email','doc','page','seconds','session'],
    Docs:     ['doc','title','pages','folder_id','published','legal','claims_checked','file_ids','notes']
  }
};

// ---------- entry points ----------

function doGet() {
  return _json({ ok: true, service: 'Yello Investor Room' });
}

function doPost(e) {
  let req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return _json({ ok: false, error: 'bad_json' }); }
  try {
    switch (req.action) {
      case 'request': return _json(apiRequest(req));
      case 'open':    return _json(apiOpen(req));
      case 'verify':  return _json(apiVerify(req));
      case 'nda':     return _json(apiNda(req));
      case 'docs':    return _json(apiDocs(req));
      case 'page':    return _json(apiPage(req));
      case 'beat':    return _json(apiBeat(req));
      default:        return _json({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    console.error(err);
    return _json({ ok: false, error: 'server_error' });
  }
}

// ---------- API ----------

/** Access request from yello.health/investors/. */
function apiRequest(r) {
  if (r.website) return { ok: true };                       // honeypot: pretend success
  const email = _email(r.email), name = _clip(r.name, 120);
  if (!name || !email) return { ok: false, error: 'missing_fields' };
  _withLock(() => _tab('Requests').appendRow([new Date(), name, email, _clip(r.firm, 160), _clip(r.type, 60), _clip(r.link, 300), _clip(r.note, 1000), 'new', '']));
  _alert('Investor room request: ' + name + (r.firm ? ' (' + _clip(r.firm, 80) + ')' : ''),
    name + ' <' + email + '> asked for access.\nInvests as: ' + _clip(r.type, 60) + '\nLink: ' + _clip(r.link, 300) + '\nNote: ' + _clip(r.note, 1000) +
    '\n\nApprove from the Sheet: select the row in Requests → Yello Room → Approve selected request.');
  return { ok: true };
}

/** What the gate needs to ask for, before any session exists. */
function apiOpen(r) {
  const link = _link(r.k);
  const bad = _linkProblem(link);
  if (bad) return { ok: false, error: bad };
  return { ok: true, needsEmail: true, needsPasscode: !!String(link.passcode || '').trim(),
           investor: link.email === '*' ? '' : link.investor, ndaVersion: ROOM.NDA_VERSION };
}

/** Email (+ passcode) check → session. */
function apiVerify(r) {
  const link = _link(r.k);
  const bad = _linkProblem(link);
  if (bad) return { ok: false, error: bad };
  const cache = CacheService.getScriptCache(), failKey = 'fail:' + link.token;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= ROOM.MAX_VERIFY_FAILS) return { ok: false, error: 'too_many_attempts' };

  const email = _email(r.email);
  const emailOk = email && (link.email === '*' || link.email === email);
  const pass = String(link.passcode || '').trim();
  const passOk = !pass || String(r.passcode || '').trim() === pass;
  if (!emailOk || !passOk) {
    cache.put(failKey, String(fails + 1), 3600);
    return { ok: false, error: !emailOk ? 'email_mismatch' : 'wrong_passcode' };
  }

  const ndaDone = _ndaAccepted(link.token, email);
  const sid = Utilities.getUuid();
  _putSession(sid, { token: link.token, email: email, nda: ndaDone });

  // open counters + first-open alert
  _withLock(() => {
    const sh = _tab('Links'), row = link._row, now = new Date(), C = _col('Links');
    const first = !link.first_open;
    if (first) sh.getRange(row, C.first_open).setValue(now);
    sh.getRange(row, C.last_open).setValue(now);
    sh.getRange(row, C.opens).setValue(Number(link.opens || 0) + 1);
    if (first) _alert('First open: ' + (link.investor || email) + ' opened the investor room',
      (link.investor || '') + (link.firm ? ' (' + link.firm + ')' : '') + ' <' + email + '> opened their link for the first time at ' + now + '.');
  });
  return { ok: true, s: sid, email: email, ndaDone: ndaDone, ndaVersion: ROOM.NDA_VERSION };
}

/** Confidentiality acknowledgement. */
function apiNda(r) {
  const sess = _session(r.s); if (sess.error) return sess;
  const name = _clip(r.name, 120);
  if (!name || r.agree !== true) return { ok: false, error: 'nda_required' };
  _withLock(() => _tab('NDA').appendRow([new Date(), sess.token, name, sess.email, ROOM.NDA_VERSION]));
  sess.nda = true; _putSession(r.s, sess);
  return { ok: true };
}

/** Documents this link may see. */
function apiDocs(r) {
  const sess = _session(r.s, true); if (sess.error) return sess;
  const docs = _allowedDocs(sess.link).map(d => ({ doc: d.doc, title: d.title, pages: Number(d.pages) || 0, legal: _yes(d.legal) }));
  return { ok: true, docs: docs, investor: sess.link.investor || '', email: sess.email };
}

/** One page image (base64 PNG). */
function apiPage(r) {
  const sess = _session(r.s, true); if (sess.error) return sess;
  const d = _allowedDocs(sess.link).filter(x => x.doc === String(r.doc))[0];
  if (!d) return { ok: false, error: 'doc_not_allowed' };
  const n = Math.floor(Number(r.page));
  const ids = _parse(d.file_ids, []);
  if (!(n >= 1 && n <= ids.length)) return { ok: false, error: 'bad_page' };
  const blob = DriveApp.getFileById(ids[n - 1]).getBlob();
  return { ok: true, page: n, pages: ids.length, mime: blob.getContentType() || 'image/png', data: Utilities.base64Encode(blob.getBytes()) };
}

/** Heartbeat: seconds on a page. One Views row per session × doc × page. */
function apiBeat(r) {
  const sess = _session(r.s, true); if (sess.error) return sess;
  const secs = Math.max(0, Math.min(30, Math.round(Number(r.secs) || 0)));
  const doc = String(r.doc || ''), page = Math.floor(Number(r.page) || 0);
  if (!secs || !doc || page < 1) return { ok: true };
  if (!_allowedDocs(sess.link).some(x => x.doc === doc)) return { ok: false, error: 'doc_not_allowed' };
  const cache = CacheService.getScriptCache(), key = 'vrow:' + r.s + ':' + doc + ':' + page;
  _withLock(() => {
    const sh = _tab('Views'), C = _col('Views'), now = new Date();
    const row = Number(cache.get(key) || 0);
    if (row > 1 && sh.getRange(row, C.session).getValue() === r.s) {
      const cell = sh.getRange(row, C.seconds);
      cell.setValue(Number(cell.getValue() || 0) + secs);
      sh.getRange(row, C.last_seen).setValue(now);
    } else {
      sh.appendRow([now, now, sess.token, sess.email, doc, page, secs, r.s]);
      cache.put(key, String(sh.getLastRow()), ROOM.SESSION_SECS);
    }
  });
  return { ok: true };
}

// ---------- sessions & links ----------

function _putSession(sid, obj) {
  CacheService.getScriptCache().put('sess:' + sid, JSON.stringify({ token: obj.token, email: obj.email, nda: !!obj.nda }), ROOM.SESSION_SECS);
}

/** Resolve a session; re-checks the link every call so revoke/expiry bite immediately. */
function _session(sid, needNda) {
  const raw = sid && CacheService.getScriptCache().get('sess:' + sid);
  if (!raw) return { ok: false, error: 'session_expired' };
  const sess = JSON.parse(raw);
  const link = _link(sess.token);
  const bad = _linkProblem(link);
  if (bad) return { ok: false, error: bad };
  if (needNda && !sess.nda) return { ok: false, error: 'nda_required' };
  sess.link = link;
  return sess;
}

function _link(token) {
  token = String(token || '').trim();
  if (!token) return null;
  const rows = _rows('Links');
  for (let i = 0; i < rows.length; i++) if (rows[i].token === token) return rows[i];
  return null;
}

function _linkProblem(link) {
  if (!link) return 'link_not_found';
  if (String(link.status).toLowerCase() !== 'active') return 'link_revoked';
  if (link.expires && new Date(link.expires).getTime() < Date.now()) return 'link_expired';
  return '';
}

function _ndaAccepted(token, email) {
  return _rows('NDA').some(r => r.token === token && _email(r.email) === email && r.version === ROOM.NDA_VERSION);
}

function _allowedDocs(link) {
  const allow = String(link.docs || 'all').split(',').map(s => s.trim()).filter(String);
  const all = allow.length === 0 || allow.indexOf('all') >= 0;
  return _rows('Docs').filter(d => _yes(d.published) && Number(d.pages) > 0 && (all || allow.indexOf(String(d.doc)) >= 0));
}

// ---------- sheet helpers ----------

function _ss() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function _tab(name) {
  const sh = _ss().getSheetByName(name);
  if (!sh) throw new Error('Missing tab ' + name + ' — run Yello Room → Set up room');
  return sh;
}
function _col(name) { const c = {}; ROOM.TABS[name].forEach((h, i) => c[h] = i + 1); return c; }
function _rows(name) {
  const sh = _tab(name), n = sh.getLastRow();
  if (n < 2) return [];
  const H = ROOM.TABS[name];
  return sh.getRange(2, 1, n - 1, H.length).getValues().map((v, i) => {
    const o = { _row: i + 2 }; H.forEach((h, j) => o[h] = (h === 'email' ? _email(v[j]) || String(v[j]).trim() : v[j])); return o;
  });
}
function _withLock(fn) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---------- small utils ----------

function _json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function _email(s) { s = String(s || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s === '*' ? s : ''; }
function _clip(s, n) { return String(s || '').trim().slice(0, n); }
function _yes(v) { return v === true || /^(y|yes|true|1)$/i.test(String(v).trim()); }
function _parse(s, dflt) { try { return JSON.parse(s); } catch (e) { return dflt; } }
function _alert(subject, body) {
  const to = PropertiesService.getScriptProperties().getProperty('ALERT_EMAIL');
  if (!to) return;
  try { MailApp.sendEmail({ to: to, subject: '[Yello room] ' + subject, body: body, name: 'Yello Investor Room' }); } catch (e) { console.error(e); }
}
