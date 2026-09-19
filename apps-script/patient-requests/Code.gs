/**
 * Yello Patient Requests — intake for yello.health (bookings, prescriptions, contact, subscribe).
 *
 * The public site never books or charges: every "booking" is a request that lands here,
 * alerts the team by email, and gets a call back to confirm time, centre and price.
 * Bound to the Sheet "Yello Patient Requests" (owner admin@studiocahaya.com).
 * Prescriptions (≤5 MB) are saved to Drive: "Yello Patient Requests/Prescriptions".
 *
 * DEPLOY: Web app · Execute as Me · Access Anyone. Paste the /exec URL into
 * assets/leads-config.js (LEADS_API). Run setup() once from the editor first.
 */

const LEADS = {
  ROOT_FOLDER: 'Yello Patient Requests',
  TABS: {
    Bookings:      ['ts', 'ref', 'status', 'name', 'age', 'gender', 'mobile', 'email', 'test', 'option', 'visitType', 'date', 'slot', 'indicativePrice', 'mrp', 'address', 'note', 'page'],
    Prescriptions: ['ts', 'ref', 'status', 'mobile', 'note', 'fileName', 'fileUrl', 'page'],
    Contact:       ['ts', 'ref', 'status', 'topic', 'contact', 'message', 'page'],
    Subscribers:   ['ts', 'email', 'page']
  }
};

function doGet() { return _out({ ok: true, service: 'Yello Patient Requests' }); }

function doPost(e) {
  let r = {};
  try { r = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return _out({ ok: false, error: 'bad_json' }); }
  if (r.website) return _out({ ok: true });                    // honeypot
  try {
    const ref = 'Y' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'MMdd') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const c = (k, n) => String(r[k] == null ? '' : r[k]).trim().slice(0, n || 300);
    switch (r.type) {
      case 'booking': {
        if (!c('name') || _digits(r.mobile).length < 10) return _out({ ok: false, error: 'missing_fields' });
        _append('Bookings', [new Date(), ref, 'new', c('name', 120), c('age', 5), c('gender', 12), c('mobile', 20), c('email', 120), c('test', 120), c('option', 120),
          c('visitType', 40), c('date', 20), c('slot', 40), c('indicativePrice', 10), c('mrp', 10), c('address', 500), c('note', 1000), c('page', 60)]);
        _alert('Booking request ' + ref + ': ' + c('test', 80) + ' for ' + c('name', 60),
          c('name') + ' (' + c('age') + ', ' + c('gender') + ') · call ' + c('mobile') + (r.email ? ' · ' + c('email') : '') +
          '\n' + c('test') + ' — ' + c('visitType') + '\nPreferred: ' + c('date') + ' ' + c('slot') + '\nIndicative price: Rs ' + c('indicativePrice') +
          (r.address ? '\nAddress: ' + c('address', 500) : '') + (r.note ? '\nNote: ' + c('note', 1000) : '') + '\n\nCall to confirm time, centre and final price.');
        break;
      }
      case 'prescription': {
        if (_digits(r.mobile).length < 10) return _out({ ok: false, error: 'missing_fields' });
        let url = '';
        if (r.fileData && String(r.fileData).length < 7200000) {
          const blob = Utilities.newBlob(Utilities.base64Decode(r.fileData), c('mimeType', 80) || 'application/octet-stream', ref + ' ' + c('fileName', 120));
          url = _folder('Prescriptions').createFile(blob).getUrl();
        }
        _append('Prescriptions', [new Date(), ref, 'new', c('mobile', 20), c('note', 1000), c('fileName', 120), url, c('page', 60)]);
        _alert('Prescription ' + ref + ' from ' + c('mobile'), 'Call ' + c('mobile') + '\nNote: ' + c('note', 1000) + '\nFile: ' + (url || '(too large — ask on WhatsApp)'));
        break;
      }
      case 'contact': {
        if (!c('contact') || !c('message')) return _out({ ok: false, error: 'missing_fields' });
        _append('Contact', [new Date(), ref, 'new', c('topic', 60), c('contact', 120), c('message', 2000), c('page', 60)]);
        _alert('Message ' + ref + ': ' + c('topic', 60), 'From ' + c('contact') + '\n\n' + c('message', 2000));
        break;
      }
      case 'subscribe': {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c('email'))) return _out({ ok: false, error: 'bad_email' });
        _append('Subscribers', [new Date(), c('email', 120), c('page', 60)]);
        break;
      }
      default: return _out({ ok: false, error: 'unknown_type' });
    }
    return _out({ ok: true, ref: ref });
  } catch (err) {
    console.error(err);
    return _out({ ok: false, error: 'server_error' });
  }
}

/** Run once from the editor: tabs, Drive folder, alert address. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', ss.getId());
  if (!props.getProperty('ALERT_EMAIL')) props.setProperty('ALERT_EMAIL', Session.getEffectiveUser().getEmail());
  Object.keys(LEADS.TABS).forEach(name => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, 1, LEADS.TABS[name].length).setValues([LEADS.TABS[name]]).setFontWeight('bold').setBackground('#fbf7ec');
    sh.setFrozenRows(1);
  });
  _folder('Prescriptions');
}

function _append(tab, row) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try { SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')).getSheetByName(tab).appendRow(row); }
  finally { lock.releaseLock(); }
}
function _folder(name) {
  const it = DriveApp.getFoldersByName(LEADS.ROOT_FOLDER);
  const root = it.hasNext() ? it.next() : DriveApp.createFolder(LEADS.ROOT_FOLDER);
  const sub = root.getFoldersByName(name);
  return sub.hasNext() ? sub.next() : root.createFolder(name);
}
function _alert(subject, body) {
  const to = PropertiesService.getScriptProperties().getProperty('ALERT_EMAIL');
  if (to) try { MailApp.sendEmail({ to: to, subject: '[Yello] ' + subject, body: body, name: 'Yello requests' }); } catch (e) { console.error(e); }
}
function _digits(s) { return String(s || '').replace(/\D/g, ''); }
function _out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
