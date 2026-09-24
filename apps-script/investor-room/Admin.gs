/**
 * Yello Investor Room — admin surface (runs inside the Sheet, never on the web).
 * Menu: Yello Room → New investor link · Approve selected request · Revoke selected link ·
 * Preview link for me · Block an email or domain · Publish doc from folder · Refresh dashboard ·
 * Send digest now · Set up / upgrade room.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Yello Room')
    .addItem('New investor link…', 'menuNewLink')
    .addItem('Approve selected request', 'menuApproveRequest')
    .addItem('Revoke selected link', 'menuRevokeLink')
    .addItem('Preview link for me (sees drafts)', 'menuPreviewLink')
    .addItem('Block an email or domain…', 'menuBlock')
    .addSeparator()
    .addItem('Publish doc from folder…', 'menuPublishDoc')
    .addItem('Refresh dashboard', 'refreshDashboard')
    .addItem('Send digest now', 'sendDigest')
    .addSeparator()
    .addItem('Set up / upgrade room', 'setupRoom')
    .addToUi();
}

/** First run and upgrades (idempotent): tabs, headers, Drive root, properties, dashboard, triggers. Never deletes data. */
function setupRoom() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', ss.getId());
  if (!props.getProperty('ALERT_EMAIL')) props.setProperty('ALERT_EMAIL', 'dr.nagasaiteja@yello.health');   // partners@yello.health is a group that also delivers here
  if (!props.getProperty('ROOM_URL')) props.setProperty('ROOM_URL', 'https://yello.health/room/');

  Object.keys(ROOM.TABS).forEach(name => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const H = ROOM.TABS[name];
    if (sh.getMaxColumns() < H.length) sh.insertColumnsAfter(sh.getMaxColumns(), H.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, H.length).setValues([H]).setFontWeight('bold').setBackground('#fbf7ec');
    sh.setFrozenRows(1);
  });
  _tab('Links').getRange('A:A').setNumberFormat('@');
  _tab('Links').getRange('E:E').setNumberFormat('@');     // passcodes stay text
  _tab('Docs').getRange('A:A').setNumberFormat('@');
  _rootFolder_();
  refreshDashboard();

  ScriptApp.getProjectTriggers().filter(t => ['sendDigest', 'refreshDashboard'].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendDigest').timeBased().atHour(19).everyDays(1).inTimezone('Asia/Kolkata').create();
  ScriptApp.newTrigger('refreshDashboard').timeBased().everyHours(1).create();
  const def = ss.getSheetByName('Sheet1'); if (def && def.getLastRow() === 0) ss.deleteSheet(def);
  SpreadsheetApp.getUi().alert('Room ready (v2). Alerts go to ' + props.getProperty('ALERT_EMAIL') + '. Links point at ' + props.getProperty('ROOM_URL') + '. The dashboard refreshes every hour.');
}

// ---------- links ----------

function menuNewLink() {
  const ui = SpreadsheetApp.getUi();
  const investor = _ask(ui, 'Investor name'); if (investor === null) return;
  const firm = _ask(ui, 'Firm (blank if none)'); if (firm === null) return;
  const email = _ask(ui, 'Investor email — or * for a shareable link that records whatever email the viewer enters'); if (email === null) return;
  const e = _email(email); if (!e) return ui.alert('That email doesn\'t look right. Nothing was created.');
  let allow = '';
  if (e === '*') { allow = _ask(ui, 'Who may use this shareable link? Emails and/or @domains separated by commas (e.g. @endiya.com). Blank = anyone.'); if (allow === null) return; }
  const pass = _ask(ui, 'Passcode (blank for none)'); if (pass === null) return;
  const docs = _ask(ui, 'Docs this link can see: "all", or doc ids separated by commas'); if (docs === null) return;
  const days = _ask(ui, 'Expires in how many days? (blank = never)'); if (days === null) return;
  const dl = ui.alert('Allow downloads on this link? (Watermarked with the viewer\'s email and logged.)', ui.ButtonSet.YES_NO) === ui.Button.YES;
  _createLink({ investor: investor, firm: firm, email: e, passcode: pass, docs: docs || 'all', days: days, download: dl, allow: allow });
}

function menuApproveRequest() {
  const ui = SpreadsheetApp.getUi(), sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== 'Requests') return ui.alert('Select a row on the Requests tab first.');
  const row = sh.getActiveRange().getRow(); if (row < 2) return ui.alert('Select a request row.');
  const C = _col('Requests'), v = sh.getRange(row, 1, 1, ROOM.TABS.Requests.length).getValues()[0];
  if (v[C.token - 1]) return ui.alert('This request already has a link.');
  const docs = _ask(ui, 'Docs for ' + v[C.name - 1] + ': "all", or doc ids separated by commas'); if (docs === null) return;
  const days = _ask(ui, 'Expires in how many days? (blank = never)'); if (days === null) return;
  const dl = ui.alert('Allow downloads for ' + v[C.name - 1] + '? (Watermarked and logged.)', ui.ButtonSet.YES_NO) === ui.Button.YES;
  const token = _createLink({ investor: v[C.name - 1], firm: v[C.firm - 1], email: _email(v[C.email - 1]), passcode: '', docs: docs || 'all', days: days, download: dl });
  if (token) { sh.getRange(row, C.status).setValue('approved'); sh.getRange(row, C.token).setValue(token); }
}

function menuRevokeLink() {
  const ui = SpreadsheetApp.getUi(), sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== 'Links') return ui.alert('Select a row on the Links tab first.');
  const row = sh.getActiveRange().getRow(); if (row < 2) return ui.alert('Select a link row.');
  const C = _col('Links');
  const who = sh.getRange(row, C.investor).getValue() || sh.getRange(row, C.email).getValue();
  if (ui.alert('Revoke access for ' + who + '? Their next page load is refused.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  sh.getRange(row, C.status).setValue('revoked');
}

/** A link for the founders that also shows unpublished drafts — to review a doc exactly as investors will see it. */
function menuPreviewLink() {
  const ui = SpreadsheetApp.getUi();
  const me = PropertiesService.getScriptProperties().getProperty('ALERT_EMAIL') || Session.getActiveUser().getEmail();
  const email = _ask(ui, 'Preview link — which email will you sign in with? (default ' + me + ')'); if (email === null) return;
  const e = _email(email || me); if (!e || e === '*') return ui.alert('Use a real email address.');
  _createLink({ investor: 'Preview (founders)', firm: 'Yello', email: e, passcode: '', docs: 'all', days: '30', download: true, preview: true, silent: true });
}

function menuBlock() {
  const ui = SpreadsheetApp.getUi();
  const entry = _ask(ui, 'Email or @domain to block (e.g. someone@x.com or @x.com). Blocked viewers are cut off on their next page load.'); if (!entry) return;
  const e = entry.trim().toLowerCase();
  if (!(/^@?[^\s@]+\.[^\s@]+$/.test(e) || _email(e))) return ui.alert('That doesn\'t look like an email or domain.');
  const reason = _ask(ui, 'Reason (for your records)'); if (reason === null) return;
  _withLock(() => _tab('Blocklist').appendRow([e, reason, new Date()]));
  ui.alert('Blocked ' + e + '.');
}

function _createLink(o) {
  const ui = SpreadsheetApp.getUi();
  const token = Utilities.getUuid().replace(/-/g, '');
  const d = parseInt(o.days, 10);
  const expires = d > 0 ? new Date(Date.now() + d * 86400000) : '';
  _withLock(() => _tab('Links').appendRow([token, o.investor, o.firm, o.email, String(o.passcode || ''), o.docs, expires, 'active', new Date(), '', '', 0, '',
                                           o.download ? 'Y' : 'N', o.allow || '', o.preview ? 'Y' : 'N']));
  const url = _roomUrl(token);
  if (o.silent) { ui.alert('Preview link (shows drafts too, 30 days):\n' + url); return token; }
  if (o.email !== '*' && ui.alert('Link created:\n' + url + '\n\nEmail it to ' + o.email + ' now?', ui.ButtonSet.YES_NO) === ui.Button.YES) {
    MailApp.sendEmail({
      to: o.email, name: 'Yello — NDIAN Healthcare', replyTo: PropertiesService.getScriptProperties().getProperty('ALERT_EMAIL'),
      subject: 'Your private link to the Yello investor room',
      body: 'Hello ' + (o.investor || '') + ',\n\nHere is your private link to the Yello investor room:\n' + url +
        '\n\nIt is tied to this email address' + (o.passcode ? ' and a passcode we will share separately' : '') +
        '. Please don\'t forward it; ask us and we will set up access for colleagues.\n\n' +
        'You can ask us a question on any page from inside the room.\n\n— Yello (NDIAN Healthcare Private Limited)'
    });
    ui.alert('Sent to ' + o.email + '.');
  } else if (o.email === '*') {
    ui.alert('Shareable link created' + (o.allow ? ' (only ' + o.allow + ')' : '') + ':\n' + url);
  }
  return token;
}

function _roomUrl(token) {
  return (PropertiesService.getScriptProperties().getProperty('ROOM_URL') || 'https://yello.health/room/') + '?k=' + token;
}

// ---------- documents ----------

/**
 * Register a doc in <root>/docs/<docId>/:
 *   page images (p01.png, p02.png…)  → image doc, or
 *   one self-contained .html file     → HTML doc (live, slide-by-slide tracking on <section> elements).
 */
function menuPublishDoc() {
  const ui = SpreadsheetApp.getUi();
  const id = _ask(ui, 'Doc id (folder name under "' + ROOM.ROOT_FOLDER + '/docs", e.g. deck-16cr)'); if (!id) return;
  const docsRoot = _sub_(_rootFolder_(), 'docs');
  const it = docsRoot.getFoldersByName(id);
  if (!it.hasNext()) { _sub_(docsRoot, id); return ui.alert('Created folder docs/' + id + '. Upload the page images (p01.png, p02.png…) or one .html file into it, then run Publish again.'); }
  const folder = it.next(), images = [], htmls = [];
  const fi = folder.getFiles();
  while (fi.hasNext()) {
    const f = fi.next();
    if (f.isTrashed()) continue;
    if (/^image\//.test(f.getMimeType())) images.push(f);
    else if (f.getMimeType() === 'text/html' || /\.html?$/i.test(f.getName())) htmls.push(f);
  }
  let type, files, pages;
  if (htmls.length) {
    htmls.sort((a, b) => b.getLastUpdated() - a.getLastUpdated());
    type = 'html'; files = [htmls[0]];
    const src = htmls[0].getBlob().getDataAsString('UTF-8');
    pages = (src.match(/<section[\s>]/gi) || []).length;
    if (!pages) return ui.alert(htmls[0].getName() + ' has no <section> elements, so slides can\'t be tracked. Wrap each slide/page in <section>.');
  } else if (images.length) {
    type = 'images'; files = images.sort((a, b) => a.getName().localeCompare(b.getName(), 'en', { numeric: true })); pages = files.length;
  } else return ui.alert('No page images or .html file in docs/' + id + ' yet.');

  const existing = _rows('Docs').filter(d => String(d.doc) === id)[0];
  const title = _ask(ui, 'Title investors will see' + (existing ? ' (currently "' + existing.title + '")' : '')); if (title === null) return;
  const folderName = _ask(ui, 'Room folder for this doc, e.g. "Pitch", "Round terms", "Diligence"' + (existing && existing.folder ? ' (currently "' + existing.folder + '")' : '')); if (folderName === null) return;
  const order = _ask(ui, 'Sort order (1 = first)'); if (order === null) return;
  const legal = ui.alert('Is this legal paper (term sheet, agreement)? It will carry the not-for-signature banner.', ui.ButtonSet.YES_NO) === ui.Button.YES;
  const checked = ui.alert('Has this doc passed ndian-claims-check AND been approved by Teja for investors?\n\nNo = saved as a draft that only preview links can see.', ui.ButtonSet.YES_NO) === ui.Button.YES;
  const ids = JSON.stringify(files.map(f => f.getId()));
  _withLock(() => {
    const sh = _tab('Docs');
    const vals = [id, title || (existing && existing.title) || id, pages, folder.getId(), checked ? 'Y' : 'N', legal ? 'Y' : 'N', checked ? new Date() : '', ids, existing ? existing.notes : '',
                  type, folderName || (existing && existing.folder) || 'Documents', Number(order) || (existing && existing.order) || 99];
    if (existing) sh.getRange(existing._row, 1, 1, vals.length).setValues([vals]); else sh.appendRow(vals);
  });
  ui.alert(pages + (type === 'html' ? ' slides (live HTML)' : ' pages') + ' registered for "' + title + '". ' +
    (checked ? 'Published.' : 'Saved as a DRAFT — only preview links see it. Set published = Y once it passes claims-check and Teja approves.'));
}

// ---------- dashboard & digest ----------

/** Rebuilds the Dashboard tab: investor table, completion per doc, page drop-off, and charts. Runs hourly. */
function refreshDashboard() {
  const ss = _ss();
  const sh = ss.getSheetByName('Dashboard') || ss.insertSheet('Dashboard', 0);
  sh.getCharts().forEach(c => sh.removeChart(c));
  sh.clear();
  const tz = ss.getSpreadsheetTimeZone();
  sh.getRange('A1').setValue('Yello investor room — updated ' + Utilities.formatDate(new Date(), tz, 'd MMM yyyy, HH:mm')).setFontWeight('bold').setFontSize(14);

  const links = _rows('Links'), docs = _rows('Docs').filter(d => Number(d.pages) > 0).sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
  const views = _rows('Views'), visits = _rows('Visits'), qs = _rows('Questions'), dls = _rows('Downloads'), nda = _rows('NDA');
  const linkBy = {}; links.forEach(l => linkBy[String(l.token)] = l);
  const nameBy = {}; nda.forEach(n => nameBy[_email(n.email)] = n.name);
  const preview = {}; links.filter(l => _yes(l.preview)).forEach(l => preview[String(l.token)] = 1);

  // per viewer (email)
  const P = {};
  const person = (email, token) => {
    if (!P[email]) { const l = linkBy[String(token)] || {}; P[email] = { email: email, name: (l.email === '*' ? '' : l.investor) || nameBy[email] || email, firm: l.firm || '', secs: 0, seen: {}, sessions: {}, last: 0, visits: 0, where: '', device: '', q: 0, dl: 0 }; }
    return P[email];
  };
  views.filter(v => !preview[String(v.token)]).forEach(v => {
    const p = person(v.email, v.token), s = Number(v.seconds) || 0;
    p.secs += s; p.sessions[v.session] = 1; p.last = Math.max(p.last, new Date(v.last_seen).getTime() || 0);
    if (s >= 2) { p.seen[v.doc] = p.seen[v.doc] || {}; p.seen[v.doc][v.page] = 1; }
  });
  visits.filter(v => !preview[String(v.token)]).forEach(v => {
    const p = person(v.email, v.token); p.visits++;
    p.where = [v.city, v.country].filter(String).join(', '); p.device = [v.device, v.browser].filter(String).join(' · ');
    p.last = Math.max(p.last, new Date(v.ts).getTime() || 0);
  });
  qs.filter(q => !preview[String(q.token)]).forEach(q => person(q.email, q.token).q++);
  dls.filter(d => !preview[String(d.token)]).forEach(d => person(d.email, d.token).dl++);
  const people = Object.keys(P).map(k => P[k]).sort((a, b) => b.secs - a.secs);

  // investor table
  const head = ['Investor', 'Firm', 'Email', 'Visits', 'Minutes', 'Last seen', 'Location', 'Device', 'Questions', 'Downloads'].concat(docs.map(d => d.title + ' — % read'));
  sh.getRange(3, 1).setValue('Investors').setFontWeight('bold');
  let r = 4;
  sh.getRange(r, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#fbf7ec').setWrap(true);
  if (people.length) {
    const rows = people.map(p => [p.name, p.firm, p.email, p.visits || Object.keys(p.sessions).length, Math.round(p.secs / 6) / 10,
      p.last ? new Date(p.last) : '', p.where, p.device, p.q, p.dl]
      .concat(docs.map(d => Math.round(100 * Object.keys((p.seen[d.doc] || {})).length / Number(d.pages)) / 100)));
    sh.getRange(r + 1, 1, rows.length, head.length).setValues(rows);
    sh.getRange(r + 1, 6, rows.length, 1).setNumberFormat('d MMM, HH:mm');
    if (docs.length) sh.getRange(r + 1, 11, rows.length, docs.length).setNumberFormat('0%');
  } else sh.getRange(r + 1, 1).setValue('No views yet.');
  const invEnd = r + Math.max(1, people.length);

  // page drop-off table
  let pr = invEnd + 3;
  sh.getRange(pr, 1).setValue('Pages — who got how far').setFontWeight('bold');
  sh.getRange(pr + 1, 1, 1, 5).setValues([['Doc', 'Page', 'Viewers', 'Avg seconds', 'Total seconds']]).setFontWeight('bold').setBackground('#fbf7ec');
  let cur = pr + 2;
  const docBlocks = [];
  docs.forEach(d => {
    const pages = Number(d.pages), start = cur, rows = [];
    for (let n = 1; n <= pages; n++) {
      const vs = views.filter(v => !preview[String(v.token)] && String(v.doc) === String(d.doc) && Number(v.page) === n);
      const who = {}; let tot = 0; vs.forEach(v => { tot += Number(v.seconds) || 0; if ((Number(v.seconds) || 0) >= 2) who[v.email] = 1; });
      const cnt = Object.keys(who).length;
      rows.push([d.title, n, cnt, cnt ? Math.round(tot / cnt) : 0, tot]);
    }
    if (rows.length) { sh.getRange(cur, 1, rows.length, 5).setValues(rows); cur += rows.length; docBlocks.push({ d: d, start: start, n: rows.length }); }
  });

  // questions table
  let qr = cur + 2;
  sh.getRange(qr, 1).setValue('Questions and feedback').setFontWeight('bold');
  sh.getRange(qr + 1, 1, 1, 7).setValues([['When', 'Who', 'Doc', 'Page', 'Kind', 'Rating', 'Text']]).setFontWeight('bold').setBackground('#fbf7ec');
  const qrows = qs.filter(q => !preview[String(q.token)]).slice(-50).reverse().map(q => [q.ts, q.investor || q.email, q.doc, q.page, q.kind, q.rating, q.text]);
  if (qrows.length) sh.getRange(qr + 2, 1, qrows.length, 7).setValues(qrows); else sh.getRange(qr + 2, 1).setValue('None yet.');

  sh.setColumnWidth(1, 200); sh.setColumnWidth(3, 220); sh.setColumnWidth(7, 160);

  // charts (right of the tables)
  const chartCol = head.length + 2;
  let chartRow = 3;
  const add = b => { sh.insertChart(b.setPosition(chartRow, chartCol, 0, 0).setOption('width', 620).setOption('height', 300).build()); chartRow += 16; };
  if (people.length) {
    add(sh.newChart().asBarChart().addRange(sh.getRange(5, 1, people.length, 1)).addRange(sh.getRange(5, 5, people.length, 1))
      .setOption('title', 'Minutes in the room, by investor').setOption('legend', { position: 'none' }).setOption('colors', ['#0f766e']));
    if (docs.length) {
      const cb = sh.newChart().asColumnChart().addRange(sh.getRange(4, 1, people.length + 1, 1)).addRange(sh.getRange(4, 11, people.length + 1, docs.length))
        .setNumHeaders(1).setOption('title', 'How much of each document they read').setOption('vAxis', { format: 'percent', viewWindow: { min: 0, max: 1 } })
        .setOption('colors', ['#ffc40c', '#0f766e', '#444444', '#c89b00', '#5eaaa3']);
      add(cb);
    }
  }
  docBlocks.forEach(b => {
    add(sh.newChart().asColumnChart().addRange(sh.getRange(b.start, 2, b.n, 1)).addRange(sh.getRange(b.start, 3, b.n, 1))
      .setOption('title', b.d.title + ' — viewers per page (drop-off)').setOption('legend', { position: 'none' })
      .setOption('hAxis', { title: 'Page' }).setOption('vAxis', { title: 'Viewers', minValue: 0, format: '0' }).setOption('colors', ['#ffc40c']));
  });
}

function sendDigest() {
  try { refreshDashboard(); } catch (e) { console.error(e); }
  const since = Date.now() - 86400000;
  const recent = x => new Date(x).getTime() >= since;
  const views = _rows('Views').filter(v => recent(v.last_seen));
  const reqs = _rows('Requests').filter(r => String(r.status) === 'new');
  const qs = _rows('Questions').filter(q => recent(q.ts));
  const dls = _rows('Downloads').filter(d => recent(d.ts));
  const visits = _rows('Visits').filter(v => recent(v.ts));
  if (!views.length && !reqs.length && !qs.length && !dls.length) return;
  const by = {};
  views.forEach(v => { const k = v.email; by[k] = by[k] || { secs: 0, pages: {} }; by[k].secs += Number(v.seconds) || 0; by[k].pages[v.doc + ' p' + v.page] = 1; });
  const where = {}; visits.forEach(v => where[v.email] = [v.city, v.country].filter(String).join(', '));
  const lines = Object.keys(by).sort((a, b) => by[b].secs - by[a].secs)
    .map(k => '• ' + k + ' — ' + Math.round(by[k].secs / 60) + ' min, ' + Object.keys(by[k].pages).length + ' pages' + (where[k] ? ' (' + where[k] + ')' : ''));
  const qlines = qs.map(q => '• ' + (q.investor || q.email) + ' on ' + (q.doc || 'the room') + (q.page ? ' p' + q.page : '') + ': ' + (q.rating ? '[' + q.rating + '] ' : '') + String(q.text).slice(0, 200));
  _alert('Daily digest — ' + Object.keys(by).length + ' investors active, ' + qs.length + ' questions, ' + reqs.length + ' pending requests',
    'Last 24 hours:\n' + (lines.join('\n') || '• no views') +
    '\n\nQuestions and feedback:\n' + (qlines.join('\n') || '• none') +
    '\n\nDownloads: ' + dls.length + '\nPending access requests: ' + reqs.length + '\n\nOpen the Dashboard tab for charts and detail.');
}

// ---------- helpers ----------

function _ask(ui, prompt) {
  const r = ui.prompt('Yello Room', prompt, ui.ButtonSet.OK_CANCEL);
  return r.getSelectedButton() === ui.Button.OK ? r.getResponseText().trim() : null;
}
function _rootFolder_() {
  const it = DriveApp.getFoldersByName(ROOM.ROOT_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(ROOM.ROOT_FOLDER);
}
function _sub_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
