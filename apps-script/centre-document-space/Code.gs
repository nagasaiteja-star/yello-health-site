/**
 * NDIAN — Centre Document Space (unified Apps Script backend)
 *
 * One web app that: (a) receives the apply form from yello.health/partners,
 * (b) mints a per-centre private token + Drive folder, (c) serves the document
 * portal at ?c=<token>, (d) saves answers, uploads/deletes files, and re-sends
 * the private link. Consolidates the two 11-Jul scripts (leads intake + portal).
 *
 * Identity = the token in the URL (the magic link). NOT the phone. NOT a passcode.
 * Design + validation: yello-health-site/docs/superpowers/specs/2026-07-11-centre-document-space-design.md
 *
 * DEPLOY: Web app · Execute as Me · Access Anyone. Redeploy = new VERSION of the
 * existing deployment (keeps the /exec URL). Sending email needs the MailApp scope
 * (re-consent on first deploy of this version).
 */

const ROOT_FOLDER = 'NDIAN Centre Intake';
const SHEET_NAME  = 'NDIAN Centre Records';
const STAGES = ['round1', 'round2', 'signing', 'closed'];
const HEADERS = [
  'token','ts_created','last_updated','centre_name','owner_name','phone','email',
  'location','pin','modalities','nabl','pcpndt','volume','idle','notes',
  'stage','pct_complete','status','folder_url','answers_json'
];
const IDX = {}; HEADERS.forEach((h, i) => IDX[h] = i);

// ---------- entry points ----------

/** Portal (returning owner) or a small landing page if no token. */
function doGet(e) {
  const token = e && e.parameter && e.parameter.k;   // 'k', not 'c' — 'c' is a reserved Apps Script URL param (400s)
  if (!token) return _landingPage();
  const rec = _recByToken(token);
  if (!rec) return _notFoundPage();
  return _renderPortal(rec, { firstVisit: false, emailed: false });
}

/** Apply form submit (native POST navigation from the marketing page). */
function doPost(e) {
  const p = (e && e.parameter) ? e.parameter : {};
  const phone = _digits(p.phone);
  const email = String(p.email || '').trim().toLowerCase();

  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  let rec, firstVisit = false, emailed = false;
  try {
    const sh = _sheet();
    // Dedup: existing centre by phone OR email → return their existing space.
    let row = _findRow(sh, r => (phone && _digits(r[IDX.phone]) === phone) ||
                                (email && String(r[IDX.email]).trim().toLowerCase() === email));
    if (row > 0) {
      rec = _rowToRec(sh.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
    } else {
      const token = Utilities.getUuid();
      const folder = _centreFolder(token, p.centre);
      // site sends a joined hidden `modalities` field; fall back to first checkbox
      const modalities = String(p.modalities || p.modality || '').trim();
      const vals = new Array(HEADERS.length).fill('');
      vals[IDX.token] = token;
      vals[IDX.ts_created] = new Date();
      vals[IDX.last_updated] = new Date();
      vals[IDX.centre_name] = p.centre || '';
      vals[IDX.owner_name] = p.owner || '';
      vals[IDX.phone] = phone;
      vals[IDX.email] = email;
      vals[IDX.location] = p.locality || p.location || '';
      vals[IDX.pin] = p.pin || '';            // postal PIN code (location data)
      vals[IDX.modalities] = modalities;
      vals[IDX.nabl] = p.nabl || '';
      vals[IDX.pcpndt] = p.pcpndt || '';
      vals[IDX.volume] = p.volume || '';
      vals[IDX.idle] = p.idle || '';
      vals[IDX.notes] = p.notes || '';
      vals[IDX.stage] = 'round1';             // upload enabled immediately
      vals[IDX.pct_complete] = 0;
      vals[IDX.status] = 'applied';
      vals[IDX.folder_url] = folder.getUrl();
      vals[IDX.answers_json] = '{}';
      sh.appendRow(vals);
      rec = _rowToRec(vals);
      firstVisit = true;
    }
  } finally { lock.releaseLock(); }

  // Email the private link (best-effort; never block on it).
  if (email) emailed = _sendLink(rec);
  return _renderPortal(rec, { firstVisit: firstVisit, emailed: emailed });
}

// ---------- API (google.script.run from the portal) ----------

/** Return the record for a token, or null. */
function loadByToken(token) {
  const rec = _recByToken(token);
  return rec ? _publicRec(rec) : null;
}

/** Autosave answers. Lock-guarded (shares the row with upload/delete). */
function saveProgress(token, answersJson, pct, status) {
  return _withRow(token, (sh, row, rec) => {
    sh.getRange(row, IDX.answers_json + 1).setValue(answersJson || '{}');
    sh.getRange(row, IDX.pct_complete + 1).setValue(pct || 0);
    sh.getRange(row, IDX.status + 1).setValue(status || rec.status || 'in progress');
    sh.getRange(row, IDX.last_updated + 1).setValue(new Date());
    return { ok: true };
  });
}

/** Upload one file into the centre folder; record the ref under `item` in answers_json. */
function uploadFile(token, item, filename, mimeType, base64Data) {
  const bytes = Utilities.base64Decode(base64Data);
  if (bytes.length > 15 * 1024 * 1024) throw new Error('File over 15 MB — send it on WhatsApp instead');
  return _withRow(token, (sh, row, rec) => {
    const folder = _centreFolder(rec.token, rec.centre_name);
    const blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream',
      (item ? item + ' — ' : '') + (filename || 'document'));
    const file = folder.createFile(blob);
    const A = _parse(rec.answers_json);
    A[item] = A[item] || { fields: {}, files: [], later: false };
    A[item].files = A[item].files || [];
    A[item].files.push({ name: file.getName(), url: file.getUrl(), fileId: file.getId() });
    sh.getRange(row, IDX.answers_json + 1).setValue(JSON.stringify(A));
    sh.getRange(row, IDX.last_updated + 1).setValue(new Date());
    return { ok: true, url: file.getUrl(), name: file.getName(), fileId: file.getId() };
  });
}

/** Remove a file the owner uploaded (from Drive + the record). */
function deleteFile(token, item, fileId) {
  return _withRow(token, (sh, row, rec) => {
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {}
    const A = _parse(rec.answers_json);
    if (A[item] && A[item].files) A[item].files = A[item].files.filter(f => f.fileId !== fileId);
    sh.getRange(row, IDX.answers_json + 1).setValue(JSON.stringify(A));
    sh.getRange(row, IDX.last_updated + 1).setValue(new Date());
    return { ok: true };
  });
}

/** Re-send the private link to the email ALREADY ON FILE (never a supplied address). */
function resendLink(token) {
  const rec = _recByToken(token);
  if (!rec) throw new Error('Not found');
  if (!rec.email) return { ok: false, reason: 'no-email-on-file' };
  return { ok: _sendLink(rec) };
}

// ---------- helpers ----------

function _digits(s) { return String(s || '').replace(/\D/g, ''); }
function _parse(s) { try { return JSON.parse(s || '{}'); } catch (e) { return {}; } }
function _normStage(s) { s = String(s || '').trim().toLowerCase(); return STAGES.indexOf(s) >= 0 ? s : 'round1'; }

function _rootFolder() {
  const it = DriveApp.getFoldersByName(ROOT_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_FOLDER);
}
function _centreFolder(token, centre) {
  const root = _rootFolder();
  const name = (centre || 'Centre') + ' — ' + String(token).slice(0, 8);
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

function _sheet() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('ndianSheetId'), ss;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { id = null; } }
  if (!id) {
    ss = SpreadsheetApp.create(SHEET_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(_rootFolder());
    props.setProperty('ndianSheetId', ss.getId());
  }
  const sh = ss.getSheets()[0];
  if (sh.getLastRow() === 0) { sh.appendRow(HEADERS); return sh; }
  const hdr = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (hdr.join('|') !== HEADERS.join('|')) sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  return sh;
}

function _findRow(sh, pred) {
  const n = Math.max(sh.getLastRow() - 1, 0);
  if (!n) return -1;
  const vals = sh.getRange(2, 1, n, HEADERS.length).getValues();
  for (let i = 0; i < vals.length; i++) if (pred(vals[i])) return i + 2;
  return -1;
}
function _rowToRec(v) {
  const rec = {}; HEADERS.forEach((h, i) => rec[h] = v[i]);
  rec.stage = _normStage(rec.stage);
  return rec;
}
function _recByToken(token) {
  if (!token) return null;
  const sh = _sheet();
  const row = _findRow(sh, r => String(r[IDX.token]) === String(token));
  return row > 0 ? _rowToRec(sh.getRange(row, 1, 1, HEADERS.length).getValues()[0]) : null;
}
/** Run fn(sh,row,rec) under the script lock for the row with this token. */
function _withRow(token, fn) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const sh = _sheet();
    const row = _findRow(sh, r => String(r[IDX.token]) === String(token));
    if (row < 0) throw new Error('Not found');
    const rec = _rowToRec(sh.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
    return fn(sh, row, rec);
  } finally { lock.releaseLock(); }
}
/** Record shape the portal gets (adds parsed answers + portalUrl; drops nothing sensitive — token is already the key). */
function _publicRec(rec) {
  return {
    token: rec.token, centre_name: rec.centre_name, owner_name: rec.owner_name,
    email: rec.email, phone: rec.phone, stage: _normStage(rec.stage),
    status: rec.status, answers: _parse(rec.answers_json)
  };
}

function _execUrl() { return ScriptApp.getService().getUrl(); }
function _portalUrl(token) { return _execUrl() + '?k=' + encodeURIComponent(token); }

function _sendLink(rec) {
  try {
    const url = _portalUrl(rec.token);
    MailApp.sendEmail({
      to: rec.email,
      name: 'NDIAN',
      subject: 'Your private link to upload documents — NDIAN',
      htmlBody:
        'Hello' + (rec.owner_name ? ' ' + rec.owner_name : '') + ',<br><br>' +
        'Here is your private link to upload and manage your centre’s documents. ' +
        'Bookmark it — it’s how you return anytime:<br><br>' +
        '<a href="' + url + '">' + url + '</a><br><br>' +
        'Everything you share stays confidential. Reply here or WhatsApp +91 99599 53699 with any questions.<br><br>' +
        '— Team NDIAN'
    });
    return true;
  } catch (e) { return false; }
}

function _renderPortal(rec, opts) {
  const t = HtmlService.createTemplateFromFile('Index');
  t.bootJson = JSON.stringify({
    token: rec.token,
    portalUrl: _portalUrl(rec.token),
    firstVisit: !!opts.firstVisit,
    emailed: !!opts.emailed,
    hasEmail: !!rec.email,
    record: _publicRec(rec)
  });
  return t.evaluate()
    .setTitle('NDIAN — Centre documents')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function _landingPage() {
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Barlow,system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 20px;color:#242424;text-align:center">' +
    '<div style="font-weight:900;font-size:24px;color:#444">NDIAN<span style="color:#ffc40c">.</span></div>' +
    '<p style="color:#6a6d73;margin-top:14px">Open your <b>private link</b> to reach your documents. ' +
    'Lost it? WhatsApp +91 99599 53699 and we’ll resend it.</p>' +
    '<p style="margin-top:18px"><a href="https://yello.health/partners" style="color:#0f766e;font-weight:700">Apply to partner →</a></p></div>'
  ).setTitle('NDIAN — Centre documents');
}
function _notFoundPage() {
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Barlow,system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 20px;color:#242424;text-align:center">' +
    '<div style="font-weight:900;font-size:24px;color:#444">NDIAN<span style="color:#ffc40c">.</span></div>' +
    '<p style="color:#6a6d73;margin-top:14px">This link didn’t match a centre. Please use the exact link we sent you, ' +
    'or WhatsApp +91 99599 53699 and we’ll resend it.</p></div>'
  ).setTitle('NDIAN — Centre documents');
}
