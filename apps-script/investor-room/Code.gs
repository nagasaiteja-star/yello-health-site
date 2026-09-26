/**
 * Yello Investor Room — JSON API (Papermark-style data room on Apps Script).
 *
 * Bound to the Google Sheet "Yello Investor Room" (owner dr.nagasaiteja@yello.health).
 * The static viewer at yello.health/room/?k=<token> and the request form at
 * yello.health/investors/ call this web app with POST text/plain JSON (no CORS
 * preflight). Documents live in Drive — never in the public repo:
 *   image docs  → Yello Investor Room/docs/<doc-id>/p01.png, p02.png…
 *   HTML docs   → Yello Investor Room/docs/<doc-id>/<anything>.html (one file, self-contained)
 *
 * Checks on every call: session live (CacheService, 6 h) → link active, not expired,
 * email not blocked → NDA accepted → doc published (or link is a preview link) and
 * allowed for this link. Revoking a link or blocking an email cuts access on the next call.
 *
 * DEPLOY: Web app · Execute as Me · Access Anyone. Redeploy = new VERSION of
 * the same deployment (keeps the /exec URL). See README-Deploy.md.
 */

const ROOM = {
  ROOT_FOLDER: 'Yello Investor Room',
  NDA_VERSION: 'CONF-v2 (2026-09-24)',
  SESSION_SECS: 21600,              // 6 h, CacheService max
  MAX_VERIFY_FAILS: 10,             // per link per hour
  // New columns are only ever appended, so rows written by older versions stay aligned.
  TABS: {
    Links:     ['token','investor','firm','email','passcode','docs','expires','status','created','first_open','last_open','opens','notes','download','allow','preview'],
    Requests:  ['ts','name','email','firm','type','link','note','status','token','greeting','days','downloads','sent'],
    NDA:       ['ts','token','name','email','version'],
    Views:     ['first_seen','last_seen','token','email','doc','page','seconds','session'],
    Docs:      ['doc','title','pages','folder_id','published','legal','claims_checked','file_ids','notes','type','folder','order'],
    Visits:    ['ts','token','email','investor','session','device','os','browser','screen','city','region','country','timezone','referrer'],
    Questions: ['ts','token','email','investor','doc','page','kind','rating','text','status'],
    Downloads: ['ts','token','email','investor','doc','format'],
    Blocklist: ['entry','reason','added']
  }
};

// ---------- entry points ----------

function doGet() {
  return _json({ ok: true, service: 'Yello Investor Room', version: 2 });
}

function doPost(e) {
  let req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return _json({ ok: false, error: 'bad_json' }); }
  try {
    switch (req.action) {
      case 'request':  return _json(apiRequest(req));
      case 'open':     return _json(apiOpen(req));
      case 'verify':   return _json(apiVerify(req));
      case 'visit':    return _json(apiVisit(req));
      case 'nda':      return _json(apiNda(req));
      case 'docs':     return _json(apiDocs(req));
      case 'page':     return _json(apiPage(req));
      case 'html':     return _json(apiHtml(req));
      case 'beat':     return _json(apiBeat(req));
      case 'ask':      return _json(apiAsk(req));
      case 'download': return _json(apiDownload(req));
      default:         return _json({ ok: false, error: 'unknown_action' });
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
  if (_blocked(email)) return { ok: true };                 // blocked: accept silently, record nothing
  _withLock(() => _tab('Requests').appendRow([new Date(), name, email, _clip(r.firm, 160), _clip(r.type, 60), _clip(r.link, 300), _clip(r.note, 1000), 'new', '']));
  _alert('Investor room request: ' + name + (r.firm ? ' (' + _clip(r.firm, 80) + ')' : ''),
    name + ' <' + email + '> asked for access.\nInvests as: ' + _clip(r.type, 60) + '\nLink: ' + _clip(r.link, 300) + '\nNote: ' + _clip(r.note, 1000) +
    '\n\nTo approve: open the Requests tab and set their status to "approved". Their private link is emailed at once (all documents, 14 days, no downloads).\n' + _ss().getUrl() + '#gid=' + _tab('Requests').getSheetId());
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

/** Email (+ passcode) check → session. Allow list applies to shareable (*) links; the block list to every link. */
function apiVerify(r) {
  const link = _link(r.k);
  const bad = _linkProblem(link);
  if (bad) return { ok: false, error: bad };
  const cache = CacheService.getScriptCache(), failKey = 'fail:' + link.token;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= ROOM.MAX_VERIFY_FAILS) return { ok: false, error: 'too_many_attempts' };

  const email = _email(r.email);
  if (email && email !== '*' && _blocked(email)) return { ok: false, error: 'email_blocked' };
  const emailOk = email && email !== '*' && (link.email === '*' ? _allowedByList(link.allow, email) : link.email === email);
  const pass = String(link.passcode || '').trim();
  const passOk = !pass || String(r.passcode || '').trim() === pass;
  if (!emailOk || !passOk) {
    cache.put(failKey, String(fails + 1), 3600);
    if (email && link.email === '*' && !_allowedByList(link.allow, email)) return { ok: false, error: 'email_not_allowed' };
    return { ok: false, error: !emailOk ? 'email_mismatch' : 'wrong_passcode' };
  }

  const ndaDone = _ndaAccepted(link.token, email);
  const sid = Utilities.getUuid();
  _putSession(sid, { token: link.token, email: email, nda: ndaDone });

  _withLock(() => {
    const sh = _tab('Links'), row = link._row, now = new Date(), C = _col('Links');
    if (!link.first_open) sh.getRange(row, C.first_open).setValue(now);
    sh.getRange(row, C.last_open).setValue(now);
    sh.getRange(row, C.opens).setValue(Number(link.opens || 0) + 1);
  });
  return { ok: true, s: sid, email: email, ndaDone: ndaDone, ndaVersion: ROOM.NDA_VERSION };
}

/** Device + approximate location for a new session (sent by the viewer right after verify). Alerts on every visit. */
function apiVisit(r) {
  const sess = _session(r.s); if (sess.error) return sess;
  const cache = CacheService.getScriptCache(), key = 'visit:' + r.s;
  if (cache.get(key)) return { ok: true };
  cache.put(key, '1', ROOM.SESSION_SECS);
  const v = r.info || {}, link = sess.link;
  const row = [new Date(), sess.token, sess.email, link.investor || '', r.s, _clip(v.device, 40), _clip(v.os, 40), _clip(v.browser, 40),
               _clip(v.screen, 20), _clip(v.city, 80), _clip(v.region, 80), _clip(v.country, 60), _clip(v.timezone, 60), _clip(v.referrer, 200)];
  const prior = _rows('Visits').filter(x => x.token === sess.token && x.email === sess.email).length;
  _withLock(() => _tab('Visits').appendRow(row));
  const where = [v.city, v.country].filter(String).join(', ') || 'location unknown';
  const what = [v.device, v.os, v.browser].filter(String).join(' · ');
  _alert((prior ? 'Return visit #' + (prior + 1) : 'First open') + ': ' + (link.investor || sess.email) + ' — ' + where,
    (link.investor || '') + (link.firm ? ' (' + link.firm + ')' : '') + ' <' + sess.email + '> opened the investor room.\n' +
    'Where: ' + where + '\nDevice: ' + (what || 'unknown') + '\nWhen: ' + new Date() + '\n\nThe Dashboard tab shows what they read and for how long.');
  return { ok: true };
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

/** Documents this link may see, grouped client-side by folder. */
function apiDocs(r) {
  const sess = _session(r.s, true); if (sess.error) return sess;
  const docs = _allowedDocs(sess.link).map(d => ({
    doc: String(d.doc), title: d.title, pages: Number(d.pages) || 0, legal: _yes(d.legal),
    type: d.type === 'html' ? 'html' : 'images', folder: String(d.folder || 'Documents'), order: Number(d.order) || 99,
    draft: !_yes(d.published)
  }));
  return { ok: true, docs: docs, investor: sess.link.investor || '', email: sess.email, download: _yes(sess.link.download) };
}

/** One page image (base64 PNG) of an image doc. */
function apiPage(r) {
  const sess = _session(r.s, true); if (sess.error) return sess;
  const d = _doc(sess.link, r.doc); if (!d || d.type === 'html') return { ok: false, error: 'doc_not_allowed' };
  const n = Math.floor(Number(r.page));
  const ids = _parse(d.file_ids, []);
  if (!(n >= 1 && n <= ids.length)) return { ok: false, error: 'bad_page' };
  const blob = DriveApp.getFileById(ids[n - 1]).getBlob();
  return { ok: true, page: n, pages: ids.length, mime: blob.getContentType() || 'image/png', data: Utilities.base64Encode(blob.getBytes()) };
}

/** The full HTML of an HTML doc (the viewer sandboxes it and tracks slides). */
function apiHtml(r) {
  const sess = _session(r.s, true); if (sess.error) return sess;
  const d = _doc(sess.link, r.doc); if (!d || d.type !== 'html') return { ok: false, error: 'doc_not_allowed' };
  const ids = _parse(d.file_ids, []);
  if (!ids.length) return { ok: false, error: 'bad_page' };
  return { ok: true, pages: Number(d.pages) || 0, html: DriveApp.getFileById(ids[0]).getBlob().getDataAsString('UTF-8') };
}

/** Heartbeat: seconds on a page/slide. One Views row per session × doc × page. */
function apiBeat(r) {
  const sess = _session(r.s, true); if (sess.error) return sess;
  const secs = Math.max(0, Math.min(30, Math.round(Number(r.secs) || 0)));
  const doc = String(r.doc || ''), page = Math.floor(Number(r.page) || 0);
  if (!secs || !doc || page < 1) return { ok: true };
  if (!_doc(sess.link, doc)) return { ok: false, error: 'doc_not_allowed' };
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

/** A question about a page, or end-of-document feedback. Emails the founders at once; reply goes to the investor. */
function apiAsk(r) {
  const sess = _session(r.s, true); if (sess.error) return sess;
  const kind = r.kind === 'feedback' ? 'feedback' : 'question';
  const text = _clip(r.text, 2000), rating = kind === 'feedback' ? _clip(r.rating, 10) : '';
  if (kind === 'question' && !text) return { ok: false, error: 'empty_question' };
  if (kind === 'feedback' && !rating && !text) return { ok: false, error: 'empty_question' };
  const doc = String(r.doc || ''), page = Math.floor(Number(r.page) || 0);
  const d = doc ? _doc(sess.link, doc) : null;
  if (doc && !d) return { ok: false, error: 'doc_not_allowed' };
  // flood guard: 20 per session
  const cache = CacheService.getScriptCache(), qk = 'asks:' + r.s, n = Number(cache.get(qk) || 0);
  if (n >= 20) return { ok: false, error: 'too_many_questions' };
  cache.put(qk, String(n + 1), ROOM.SESSION_SECS);
  const link = sess.link;
  _withLock(() => _tab('Questions').appendRow([new Date(), sess.token, sess.email, link.investor || '', doc, page || '', kind, rating, text, 'new']));
  const who = (link.investor || sess.email) + (link.firm ? ' (' + link.firm + ')' : '');
  const where = d ? '"' + d.title + '"' + (page ? ', page ' + page : '') : 'the room';
  _alert(kind === 'question' ? 'Question from ' + who + ' on ' + where : 'Feedback from ' + who + ': ' + (rating || 'comment'),
    who + ' <' + sess.email + '> wrote about ' + where + ':\n\n' + (rating ? 'Rating: ' + rating + '\n' : '') + (text || '(no comment)') +
    '\n\nReply to this email to answer them directly.', sess.email);
  return { ok: true };
}

/** Download gate: only links with download = Y. Logs and alerts; the viewer builds the file. */
function apiDownload(r) {
  const sess = _session(r.s, true); if (sess.error) return sess;
  if (!_yes(sess.link.download)) return { ok: false, error: 'download_off' };
  const d = _doc(sess.link, r.doc); if (!d) return { ok: false, error: 'doc_not_allowed' };
  const format = d.type === 'html' ? 'html' : 'pdf';
  _withLock(() => _tab('Downloads').appendRow([new Date(), sess.token, sess.email, sess.link.investor || '', String(d.doc), format]));
  _alert('Download: ' + (sess.link.investor || sess.email) + ' downloaded "' + d.title + '"',
    (sess.link.investor || '') + ' <' + sess.email + '> downloaded "' + d.title + '" (' + format + ', watermarked with their email) at ' + new Date() + '.');
  return { ok: true, format: format };
}

// ---------- sessions & links ----------

function _putSession(sid, obj) {
  CacheService.getScriptCache().put('sess:' + sid, JSON.stringify({ token: obj.token, email: obj.email, nda: !!obj.nda }), ROOM.SESSION_SECS);
}

/** Resolve a session; re-checks the link and the block list every call so revoke/expiry/block bite immediately. */
function _session(sid, needNda) {
  const raw = sid && CacheService.getScriptCache().get('sess:' + sid);
  if (!raw) return { ok: false, error: 'session_expired' };
  const sess = JSON.parse(raw);
  const link = _link(sess.token);
  const bad = _linkProblem(link);
  if (bad) return { ok: false, error: bad };
  if (_blocked(sess.email)) return { ok: false, error: 'email_blocked' };
  if (needNda && !sess.nda) return { ok: false, error: 'nda_required' };
  sess.link = link;
  return sess;
}

function _link(token) {
  token = String(token || '').trim();
  if (!token) return null;
  const rows = _rows('Links');
  for (let i = 0; i < rows.length; i++) if (String(rows[i].token) === token) return rows[i];
  return null;
}

function _linkProblem(link) {
  if (!link) return 'link_not_found';
  if (String(link.status).toLowerCase() !== 'active') return 'link_revoked';
  if (link.expires && new Date(link.expires).getTime() < Date.now()) return 'link_expired';
  return '';
}

function _ndaAccepted(token, email) {
  return _rows('NDA').some(r => String(r.token) === String(token) && _email(r.email) === email && r.version === ROOM.NDA_VERSION);
}

/** Published docs this link may see; a preview link (preview = Y) also sees unpublished ones. */
function _allowedDocs(link) {
  const allow = String(link.docs || 'all').split(',').map(s => s.trim()).filter(String);
  const all = allow.length === 0 || allow.indexOf('all') >= 0;
  const preview = _yes(link.preview);
  return _rows('Docs')
    .filter(d => (preview || _yes(d.published)) && Number(d.pages) > 0 && (all || allow.indexOf(String(d.doc)) >= 0))
    .sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
}
function _doc(link, id) { return _allowedDocs(link).filter(x => String(x.doc) === String(id))[0] || null; }

/** Allow list: blank = anyone; otherwise comma-separated emails and/or @domains. */
function _allowedByList(list, email) {
  const items = String(list || '').toLowerCase().split(/[,\s]+/).filter(String);
  if (!items.length) return true;
  const domain = email.split('@')[1] || '';
  return items.some(i => i === email || (i.charAt(0) === '@' ? i.slice(1) === domain : i === domain));
}
/** Block list tab: emails or @domains. */
function _blocked(email) {
  if (!email || email === '*') return false;
  const domain = email.split('@')[1] || '';
  return _rows('Blocklist').some(b => {
    const e = String(b.entry || '').trim().toLowerCase();
    return e && (e === email || (e.charAt(0) === '@' ? e.slice(1) === domain : e === domain));
  });
}

// ---------- sheet helpers ----------

function _ss() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function _tab(name) {
  const sh = _ss().getSheetByName(name);
  if (!sh) throw new Error('Missing tab ' + name + ' — run Yello Room → Set up / upgrade room');
  return sh;
}
function _col(name) { const c = {}; ROOM.TABS[name].forEach((h, i) => c[h] = i + 1); return c; }
function _rows(name) {
  const sh = _ss().getSheetByName(name);
  if (!sh) return [];
  const n = sh.getLastRow();
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
function _clip(s, n) { return String(s == null ? '' : s).trim().slice(0, n); }
function _yes(v) { return v === true || /^(y|yes|true|1)$/i.test(String(v).trim()); }
function _parse(s, dflt) { try { return JSON.parse(s); } catch (e) { return dflt; } }
function _alert(subject, body, replyTo) {
  const to = PropertiesService.getScriptProperties().getProperty('ALERT_EMAIL');
  if (!to) return;
  const msg = { to: to, subject: '[Yello room] ' + subject, body: body, name: 'Yello Investor Room' };
  if (replyTo) msg.replyTo = replyTo;
  try { MailApp.sendEmail(msg); } catch (e) { console.error(e); }
}
