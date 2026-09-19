/**
 * Yello Investor Room — admin surface (runs inside the Sheet, never on the web).
 * Menu: Yello Room → Set up · New investor link · Approve selected request ·
 * Revoke selected link · Publish doc from folder · Send digest now.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Yello Room')
    .addItem('New investor link…', 'menuNewLink')
    .addItem('Approve selected request', 'menuApproveRequest')
    .addItem('Revoke selected link', 'menuRevokeLink')
    .addSeparator()
    .addItem('Publish doc from folder…', 'menuPublishDoc')
    .addItem('Send digest now', 'sendDigest')
    .addSeparator()
    .addItem('Set up room (first run)', 'setupRoom')
    .addToUi();
}

/** First run: tabs, headers, Drive root, properties, dashboard, daily digest trigger. */
function setupRoom() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', ss.getId());
  if (!props.getProperty('ALERT_EMAIL')) props.setProperty('ALERT_EMAIL', Session.getEffectiveUser().getEmail());
  if (!props.getProperty('ROOM_URL')) props.setProperty('ROOM_URL', 'https://yello.health/room/');

  Object.keys(ROOM.TABS).forEach(name => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const H = ROOM.TABS[name];
    sh.getRange(1, 1, 1, H.length).setValues([H]).setFontWeight('bold').setBackground('#fbf7ec');
    sh.setFrozenRows(1);
  });
  _tab('Links').getRange('A:A').setNumberFormat('@');
  _tab('Links').getRange('E:E').setNumberFormat('@');     // passcodes stay text
  _buildDashboard(ss);
  _rootFolder_();

  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sendDigest').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendDigest').timeBased().atHour(19).everyDays(1).inTimezone('Asia/Kolkata').create();
  const def = ss.getSheetByName('Sheet1'); if (def && def.getLastRow() === 0) ss.deleteSheet(def);
  SpreadsheetApp.getUi().alert('Room ready. Alerts go to ' + props.getProperty('ALERT_EMAIL') + '. Links point at ' + props.getProperty('ROOM_URL'));
}

// ---------- links ----------

function menuNewLink() {
  const ui = SpreadsheetApp.getUi();
  const investor = _ask(ui, 'Investor name'); if (investor === null) return;
  const firm = _ask(ui, 'Firm (blank if none)'); if (firm === null) return;
  const email = _ask(ui, 'Investor email — or * for a shareable link that logs any email'); if (email === null) return;
  const e = _email(email); if (!e) return ui.alert('That email doesn\'t look right. Nothing was created.');
  const pass = _ask(ui, 'Passcode (blank for none)'); if (pass === null) return;
  const docs = _ask(ui, 'Docs this link can see: "all", or doc ids separated by commas'); if (docs === null) return;
  const days = _ask(ui, 'Expires in how many days? (blank = never)'); if (days === null) return;
  _createLink({ investor: investor, firm: firm, email: e, passcode: pass, docs: docs || 'all', days: days });
}

function menuApproveRequest() {
  const ui = SpreadsheetApp.getUi(), sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== 'Requests') return ui.alert('Select a row on the Requests tab first.');
  const row = sh.getActiveRange().getRow(); if (row < 2) return ui.alert('Select a request row.');
  const C = _col('Requests'), v = sh.getRange(row, 1, 1, ROOM.TABS.Requests.length).getValues()[0];
  if (v[C.token - 1]) return ui.alert('This request already has a link.');
  const docs = _ask(ui, 'Docs for ' + v[C.name - 1] + ': "all", or doc ids separated by commas'); if (docs === null) return;
  const days = _ask(ui, 'Expires in how many days? (blank = never)'); if (days === null) return;
  const token = _createLink({ investor: v[C.name - 1], firm: v[C.firm - 1], email: _email(v[C.email - 1]), passcode: '', docs: docs || 'all', days: days });
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

function _createLink(o) {
  const ui = SpreadsheetApp.getUi();
  const token = Utilities.getUuid().replace(/-/g, '');
  const d = parseInt(o.days, 10);
  const expires = d > 0 ? new Date(Date.now() + d * 86400000) : '';
  _withLock(() => _tab('Links').appendRow([token, o.investor, o.firm, o.email, String(o.passcode || ''), o.docs, expires, 'active', new Date(), '', '', 0, '']));
  const url = _roomUrl(token);
  if (o.email !== '*' && ui.alert('Link created:\n' + url + '\n\nEmail it to ' + o.email + ' now?', ui.ButtonSet.YES_NO) === ui.Button.YES) {
    MailApp.sendEmail({
      to: o.email, name: 'Yello — NDIAN Healthcare', replyTo: PropertiesService.getScriptProperties().getProperty('ALERT_EMAIL'),
      subject: 'Your private link to the Yello investor room',
      body: 'Hello ' + (o.investor || '') + ',\n\nHere is your private link to the Yello investor room:\n' + url +
        '\n\nIt is tied to this email address' + (o.passcode ? ' and a passcode we will share separately' : '') +
        '. Please don\'t forward it; ask us and we will set up access for colleagues.\n\n— Yello (NDIAN Healthcare Private Limited)'
    });
    ui.alert('Sent to ' + o.email + '.');
  } else if (o.email === '*') {
    ui.alert('Shareable link created:\n' + url);
  }
  return token;
}

function _roomUrl(token) {
  return (PropertiesService.getScriptProperties().getProperty('ROOM_URL') || 'https://yello.health/room/') + '?k=' + token;
}

// ---------- documents ----------

/** Register a doc whose page images (p01.png, p02.png…) are in <root>/docs/<docId>/. */
function menuPublishDoc() {
  const ui = SpreadsheetApp.getUi();
  const id = _ask(ui, 'Doc id (folder name under "' + ROOM.ROOT_FOLDER + '/docs", e.g. deck-v1)'); if (!id) return;
  const docsRoot = _sub_(_rootFolder_(), 'docs');
  const it = docsRoot.getFoldersByName(id);
  if (!it.hasNext()) { _sub_(docsRoot, id); return ui.alert('Created folder docs/' + id + '. Upload the page images (p01.png, p02.png…) into it, then run Publish again.'); }
  const folder = it.next(), files = [];
  const fi = folder.getFiles();
  while (fi.hasNext()) { const f = fi.next(); if (/^image\//.test(f.getMimeType())) files.push(f); }
  if (!files.length) return ui.alert('No images in docs/' + id + ' yet.');
  files.sort((a, b) => a.getName().localeCompare(b.getName(), 'en', { numeric: true }));
  const title = _ask(ui, 'Title investors will see'); if (title === null) return;
  const legal = ui.alert('Is this legal paper (term sheet, agreement)? It will carry the not-for-signature banner.', ui.ButtonSet.YES_NO) === ui.Button.YES;
  const checked = ui.alert('Has this doc passed ndian-claims-check AND been approved by Teja for investors?', ui.ButtonSet.YES_NO) === ui.Button.YES;
  const ids = JSON.stringify(files.map(f => f.getId()));
  _withLock(() => {
    const sh = _tab('Docs'), C = _col('Docs');
    const existing = _rows('Docs').filter(d => d.doc === id)[0];
    const vals = [id, title, files.length, folder.getId(), checked ? 'Y' : 'N', legal ? 'Y' : 'N', checked ? new Date() : '', ids, ''];
    if (existing) sh.getRange(existing._row, 1, 1, vals.length).setValues([vals]); else sh.appendRow(vals);
  });
  ui.alert(files.length + ' pages registered for "' + title + '". ' + (checked ? 'Published.' : 'NOT published — set published = Y once it passes claims-check and Teja approves.'));
}

// ---------- dashboard & digest ----------

function _buildDashboard(ss) {
  const sh = ss.getSheetByName('Dashboard') || ss.insertSheet('Dashboard', 0);
  sh.clear();
  sh.getRange('A1').setValue('Engagement by investor').setFontWeight('bold');
  sh.getRange('A2').setFormula('=IFERROR(QUERY(Views!A:H,"select D, sum(G)/60, count(F), min(A), max(B) where D is not null group by D order by sum(G) desc label D \'Email\', sum(G)/60 \'Minutes\', count(F) \'Pages viewed\', min(A) \'First seen\', max(B) \'Last seen\'",1),"No views yet")');
  sh.getRange('H1').setValue('Time by page (all investors)').setFontWeight('bold');
  sh.getRange('H2').setFormula('=IFERROR(QUERY(Views!A:H,"select E, F, sum(G), count(D) where E is not null group by E, F order by E, F label E \'Doc\', F \'Page\', sum(G) \'Seconds\', count(D) \'Viewers\'",1),"No views yet")');
  sh.setColumnWidth(1, 240);
}

function sendDigest() {
  const since = Date.now() - 86400000;
  const views = _rows('Views').filter(v => new Date(v.last_seen).getTime() >= since);
  const reqs = _rows('Requests').filter(r => String(r.status) === 'new');
  if (!views.length && !reqs.length) return;
  const by = {};
  views.forEach(v => { const k = v.email; by[k] = by[k] || { secs: 0, pages: {} }; by[k].secs += Number(v.seconds) || 0; by[k].pages[v.doc + ' p' + v.page] = 1; });
  const lines = Object.keys(by).sort((a, b) => by[b].secs - by[a].secs)
    .map(k => '• ' + k + ' — ' + Math.round(by[k].secs / 60) + ' min, ' + Object.keys(by[k].pages).length + ' pages');
  _alert('Daily digest — ' + Object.keys(by).length + ' investors active, ' + reqs.length + ' pending requests',
    'Last 24 hours:\n' + (lines.join('\n') || '• no views') + '\n\nPending access requests: ' + reqs.length + '\n\nOpen the Dashboard tab for detail.');
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
