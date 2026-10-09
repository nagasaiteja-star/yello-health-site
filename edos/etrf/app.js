import { FORMS, FORM_LIST } from './schemas.mjs';
import { validate, clean, isVisible, normPhone, allFields } from './validate.mjs';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const LS = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/* ---------- documents: offline store + upload ---------- */
const DOC_KINDS = [['prescription', 'Prescription'], ['consent', 'Signed consent'], ['id_proof', 'ID proof'], ['previous_report', 'Previous report'], ['other', 'Other']];
const DOC_MAX = 8 * 1024 * 1024, DOC_TYPES = /\.(jpe?g|png|webp|heic|pdf)$/i;
function idb() {
  return new Promise((res, rej) => { const r = indexedDB.open('etrf', 1); r.onupgradeneeded = () => r.result.createObjectStore('docs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function idbPut(key, val) { try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction('docs', 'readwrite'); tx.objectStore('docs').put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); return true; } catch { return false; } }
async function idbGet(key) { try { const db = await idb(); return await new Promise((res, rej) => { const r = db.transaction('docs').objectStore('docs').get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); }); } catch { return null; } }
async function idbDel(key) { try { const db = await idb(); await new Promise(res => { const tx = db.transaction('docs', 'readwrite'); tx.objectStore('docs').delete(key); tx.oncomplete = res; tx.onerror = res; }); } catch { /* ignore */ } }
async function uploadDoc(subId, d) {
  const res = await fetch(`/api/submissions/${subId}/files?kind=${encodeURIComponent(d.kind)}&name=${encodeURIComponent(d.name)}`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body: d.blob });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw Object.assign(new Error(b.error || 'Upload failed'), { status: res.status }); }
}
// Upload a list of docs; returns the ones that failed for a network reason (to retry later).
async function uploadDocs(subId, docs) {
  const retry = [], bad = [];
  for (const d of docs) { try { await uploadDoc(subId, d); } catch (e) { (e.status ? bad : retry).push({ d, msg: e.message }); } }
  return { retry: retry.map(x => x.d), bad };
}
function docCheck(file) {
  if (!DOC_TYPES.test(file.name) && !/^(image\/|application\/pdf)/.test(file.type)) return 'Only photos (JPG, PNG, WebP, HEIC) and PDF files are accepted';
  if (file.size > DOC_MAX) return 'File is larger than 8 MB';
  if (!file.size) return 'File is empty';
  return '';
}
const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

let token = LS.get('etrf_token');
let me = null;           // { user, client }

/* ---------- api ---------- */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('json') ? await res.json() : await res.text();
  if (res.status === 401 && token && path !== '/api/auth/verify') { signOutLocal(); location.hash = '#/login'; }
  if (!res.ok) throw Object.assign(new Error(body.error || 'Request failed'), { status: res.status, body });
  return body;
}
function signOutLocal() { token = null; me = null; LS.del('etrf_token'); renderChrome(); }

/* ---------- barcode (Code 128-B) ---------- */
const C128 = ['11011001100', '11001101100', '11001100110', '10010011000', '10010001100', '10001001100', '10011001000', '10011000100', '10001100100', '11001001000', '11001000100', '11000100100', '10110011100', '10011011100', '10011001110', '10111001100', '10011101100', '10011100110', '11001110010', '11001011100', '11001001110', '11011100100', '11001110100', '11101101110', '11101001100', '11100101100', '11100100110', '11101100100', '11100110100', '11100110010', '11011011000', '11011000110', '11000110110', '10100011000', '10001011000', '10001000110', '10110001000', '10001101000', '10001100010', '11010001000', '11000101000', '11000100010', '10110111000', '10110001110', '10001101110', '10111011000', '10111000110', '10001110110', '11101110110', '11010001110', '11000101110', '11011101000', '11011100010', '11011101110', '11101011000', '11101000110', '11100010110', '11101101000', '11101100010', '11100011010', '11101111010', '11001000010', '11110001010', '10100110000', '10100001100', '10010110000', '10010000110', '10000101100', '10000100110', '10110010000', '10110000100', '10011010000', '10011000010', '10000110100', '10000110010', '11000010010', '11001010000', '11110111010', '11000010100', '10001111010', '10100111100', '10010111100', '10010011110', '10111100100', '10011110100', '10011110010', '11110100100', '11110010100', '11110010010', '11011011110', '11011110110', '11110110110', '10101111000', '10100011110', '10001011110', '10111101000', '10111100010', '11110101000', '11110100010', '10111011110', '10111101110', '11101011110', '11110101110', '11010000100', '11010010000', '11010011100', '1100011101011'];
function barcodeSvg(text, h = 54) {
  const codes = [104]; let sum = 104;
  [...text].forEach((ch, i) => { const v = ch.charCodeAt(0) - 32; codes.push(v); sum += v * (i + 1); });
  codes.push(sum % 103, 106);
  const bits = codes.map(c => C128[c]).join('');
  const w = 2; let x = 10, rects = '';
  for (let i = 0; i < bits.length; i++) { if (bits[i] === '1') { let j = i; while (bits[j] === '1') j++; rects += `<rect x="${x + i * w}" y="0" width="${(j - i) * w}" height="${h}"/>`; i = j - 1; } }
  const W = bits.length * w + 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" role="img" aria-label="Barcode ${esc(text)}" fill="#242424">${rects}</svg>`;
}

/* ---------- chrome ---------- */
function renderChrome() {
  $('#who').textContent = me ? `${me.user.name}${me.client ? ' · ' + me.client.code : ''}` : '';
  $('#btnOut').hidden = !me;
}
$('#btnOut').onclick = async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ } signOutLocal(); location.hash = '#/login'; };
function netBanner() {
  const q = LS.get('etrf_queue', []);
  const el = $('#net');
  if (!navigator.onLine) { el.hidden = false; el.textContent = 'You are offline. Forms you submit are saved and sent when you are back online.' + (q.length ? ` (${q.length} waiting)` : ''); }
  else if (q.length) { el.hidden = false; el.textContent = `${q.length} saved form${q.length > 1 ? 's' : ''} waiting to send…`; }
  else el.hidden = true;
}
window.addEventListener('online', () => { netBanner(); flushQueue(); });
window.addEventListener('offline', netBanner);

/* ---------- offline queue ---------- */
let flushing = false;
async function flushQueue() {
  if (flushing || !token || !navigator.onLine) return;
  flushing = true;
  try {
    let q = LS.get('etrf_queue', []);
    for (const item of [...q]) {
      try {
        const r = await api('/api/submissions', { method: 'POST', body: { form_id: item.form_id, data: item.data, client_ref: item.client_ref, client_code: item.client_code } });
        q = q.filter(x => x.client_ref !== item.client_ref);
        const docs = await idbGet(item.client_ref);
        if (docs && docs.length) {
          const out = await uploadDocs(r.submission.id, docs);
          if (out.retry.length) { await idbPut('retry:' + r.submission.id, out.retry); const fq = LS.get('etrf_fq', []); fq.push(r.submission.id); LS.set('etrf_fq', fq); }
        }
        await idbDel(item.client_ref);
      } catch (e) {
        if (e.status === 422 || e.status === 400) { item.failed = e.message; } else break;
      }
      LS.set('etrf_queue', q.map(x => x.client_ref === item.client_ref ? item : x));
    }
    LS.set('etrf_queue', q);
    // documents that could not be sent earlier
    for (const sid of [...LS.get('etrf_fq', [])]) {
      const docs = await idbGet('retry:' + sid);
      if (!docs) { LS.set('etrf_fq', LS.get('etrf_fq', []).filter(x => x !== sid)); continue; }
      const out = await uploadDocs(sid, docs);
      if (out.retry.length) { await idbPut('retry:' + sid, out.retry); break; }
      await idbDel('retry:' + sid); LS.set('etrf_fq', LS.get('etrf_fq', []).filter(x => x !== sid));
    }
  } finally { flushing = false; netBanner(); }
}

/* ---------- router ---------- */
const routes = [
  [/^#\/login$/, viewLogin],
  [/^#\/?$/, viewHome],
  [/^#\/new\/([a-z]+)$/, viewForm],
  [/^#\/s\/(YLO-[0-9]{6}-[A-Z0-9]{4})$/, viewDetail],
  [/^#\/list$/, viewList],
  [/^#\/admin$/, viewAdmin],
  [/^#\/patients$/, viewPatients],
  [/^#\/edit\/(YLO-[0-9]{6}-[A-Z0-9]{4})$/, viewEdit],
];
async function route() {
  const h = (location.hash || '#/').split('?')[0];
  if (!token && h !== '#/login') { location.hash = '#/login'; return; }
  if (token && !me) { try { me = await api('/api/me'); renderChrome(); } catch { location.hash = '#/login'; return; } }
  for (const [re, fn] of routes) { const m = h.match(re); if (m) { window.scrollTo(0, 0); return fn(...m.slice(1)); } }
  app.innerHTML = '<p>Page not found. <a href="#/">Home</a></p>';
}
window.addEventListener('hashchange', route);

const FOOT = '<div class="foot">NDIAN Healthcare Private Limited · CIN U86905TS2026PTC223050 · 3rd Floor, 8-2-231/18, Nagarjuna Hills Road, Mothi Nagar, Punjagutta, Hyderabad 500082 · yello.health</div>';

/* ---------- login ---------- */
function viewLogin() {
  let mobile = '';
  const step1 = () => {
    app.innerHTML = `<section class="hp"><div class="eyebrow">Yello · Diagnostics</div><h1>Send a sample online.</h1>
      <p class="sub">Fill the test requisition form on your phone. Fewer mistakes, fewer rejected samples.</p></section>
      <form class="card" id="f1"><label class="f"><span class="l">Your registered mobile number</span><input type="tel" id="mob" inputmode="numeric" autocomplete="tel" placeholder="10-digit mobile" required></label>
      <div class="err" id="e"></div><div class="stickybar" style="position:static;padding:14px 0 0"><button class="primary" id="go">Send code</button></div>
      <p class="hint">We send a one-time code by SMS. No password to remember. If your number is not registered, ask your Yello contact to add you.</p></form>${FOOT}`;
    if (window.ETRF_SANDBOX) {
      const box = document.createElement('div'); box.className = 'card';
      box.innerHTML = '<b>Demo accounts</b><div class="hint">Tap one to fill the number, then send the code. The code appears on screen in test mode. Sign out and in again to see the other side of a form.</div>' +
        window.ETRF_SANDBOX.demo.map(([m, n, d]) => `<button type="button" class="demo" data-m="${m}" style="display:flex;width:100%;justify-content:space-between;margin-top:8px;text-align:left"><span><b>${esc(n)}</b><br><span class="hint">${esc(d)}</span></span><span class="hint">${m}</span></button>`).join('');
      box.onclick = e => { const b = e.target.closest('.demo'); if (b) { $('#mob').value = b.dataset.m; $('#go').click(); } };
      $('#f1').after(box);
    }
    $('#f1').onsubmit = async e => {
      e.preventDefault(); $('#e').textContent = ''; const b = $('#go'); b.disabled = true;
      try { mobile = normPhone($('#mob').value); const r = await api('/api/auth/request', { method: 'POST', body: { mobile } }); step2(r.dev_otp); }
      catch (err) { $('#e').textContent = err.message; b.disabled = false; }
    };
  };
  const step2 = dev => {
    app.innerHTML = `<section class="hp"><div class="eyebrow">Yello · Diagnostics</div><h1>Enter your code.</h1></section>
      <form class="card" id="f2"><p class="sub">If ${esc(mobile)} is registered, a 6-digit code is on its way.</p>
      ${dev ? `<div class="banner warn"><b>Test mode.</b> Your code is <b>${esc(dev)}</b>. Real SMS is switched on at launch.</div>` : ''}
      <label class="f"><span class="l">6-digit code</span><input type="text" id="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
      <div class="err" id="e"></div><div class="stickybar" style="position:static;padding:14px 0 0"><button type="button" id="back">Back</button><button class="primary" id="go">Sign in</button></div></form>${FOOT}`;
    $('#back').onclick = step1;
    $('#f2').onsubmit = async e => {
      e.preventDefault(); $('#e').textContent = ''; const b = $('#go'); b.disabled = true;
      try {
        const r = await api('/api/auth/verify', { method: 'POST', body: { mobile, otp: $('#otp').value } });
        token = r.token; LS.set('etrf_token', token); me = null;
        await route0();
      } catch (err) { $('#e').textContent = err.message; b.disabled = false; }
    };
  };
  step1();
}
async function route0() { me = await api('/api/me'); renderChrome(); flushQueue(); location.hash = me.user.role === 'lab' ? '#/list' : '#/'; route(); }

/* ---------- home ---------- */
const STATUS_CHIP = { submitted: ['Submitted', 'line'], received: ['Received', 'teal'], accepted: ['Accepted', 'teal'], rejected: ['Rejected', 'rose'], reported: ['Reported', 'gold'] };
const chip = s => { const [t, c] = STATUS_CHIP[s] || [s, 'line']; return `<span class="chip ${c}">${t}</span>`; };
async function viewHome() {
  if (me.user.role === 'lab') { location.hash = '#/list'; return; }
  const subs = await api('/api/submissions').catch(() => []);
  app.innerHTML = `<section class="hp"><div class="eyebrow">${me.client ? esc(me.client.name) : 'Yello admin'}</div><h1>New requisition.</h1>
    <p class="sub">Pick the form for the sample you are sending.</p></section>
    <div class="grid" style="margin-top:14px">${FORM_LIST.map(f => `<a class="tile" href="#/new/${f.id}"><b>${esc(f.title)}</b><span>${esc(f.blurb)}</span></a>`).join('')}</div>
    <h2>Recent</h2>${subs.length ? listTable(subs.slice(0, 8)) : '<p class="sub">Nothing sent yet.</p>'}
    <p class="row noprint"><a href="#/patients">Patients</a>${subs.length > 8 ? ' · <a href="#/list">See all</a>' : ''}${me.user.role === 'admin' ? '<a href="#/list">All submissions</a> · <a href="#/admin">Admin</a>' : ''}</p>${FOOT}`;
  bindRows();
}
function listTable(rows) {
  return `<div class="card" style="padding:4px 8px"><table class="list"><thead><tr><th>ID</th><th>Patient</th><th>Form</th><th>Status</th></tr></thead><tbody>${rows.map(r => `<tr class="click" data-id="${r.id}"><td><b>${esc(r.id)}</b><br><span class="hint">${new Date(r.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}${me.user.role !== 'client' ? ' · ' + esc(r.client_code) : ''}</span></td><td>${esc(r.patient_name)}</td><td>${esc(r.form)}</td><td>${chip(r.status)}${r.reject_reason ? `<div class="hint">${esc(r.reject_reason)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
function bindRows() { document.querySelectorAll('tr.click').forEach(tr => tr.onclick = () => { location.hash = '#/s/' + tr.dataset.id; }); }

/* ---------- list ---------- */
async function viewList() {
  const isLab = me.user.role !== 'client';
  app.innerHTML = `<h1>${isLab ? 'Incoming samples' : 'My submissions'}</h1>
    <div class="row noprint"><input type="search" id="q" placeholder="Search ID or patient" style="flex:1;min-width:180px"><select id="st" style="width:auto"><option value="">All statuses</option>${Object.entries(STATUS_CHIP).map(([k, v]) => `<option value="${k}" ${isLab && k === 'submitted' ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>${isLab ? '<button id="csv">Export CSV</button>' : ''}</div>
    <div id="rows"></div>${FOOT}`;
  const load = async () => {
    const q = $('#q').value, st = $('#st').value;
    const rows = await api(`/api/submissions?status=${encodeURIComponent(st)}&q=${encodeURIComponent(q)}`);
    $('#rows').innerHTML = rows.length ? listTable(rows) : '<p class="sub" style="margin-top:16px">No submissions match.</p>';
    bindRows();
  };
  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  $('#st').onchange = load;
  if (isLab) $('#csv').onclick = async () => {
    const txt = await api('/api/submissions.csv');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv' })); a.download = 'yello-etrf-submissions.csv'; a.click();
  };
  load();
}

/* ---------- form ---------- */
function fieldHtml(f) {
  const req = f.required ? ' <i>*</i>' : '';
  const hint = f.hint ? `<div class="hint">${esc(f.hint)}</div>` : '';
  const wrap = (inner, label = true) => `<div class="fld" data-f="${f.id}">${label ? `<label class="f"><span class="l">${esc(f.label)}${req}</span>${inner}</label>` : inner}${hint}<div class="err" data-e="${f.id}"></div></div>`;
  switch (f.type) {
    case 'note': return `<div class="fld" data-f="${f.id}"><div class="hint">${esc(f.label)}</div></div>`;
    case 'textarea': return wrap(`<textarea data-i="${f.id}" maxlength="${f.maxLen ?? 2000}"></textarea>`);
    case 'select': return wrap(`<select data-i="${f.id}"><option value="">Choose…</option>${f.options.map(o => `<option>${esc(o)}</option>`).join('')}</select>`);
    case 'radio': return wrap(`<div class="opts">${f.options.map(o => `<label class="opt"><input type="radio" name="${f.id}" value="${esc(o)}" data-i="${f.id}">${esc(o)}</label>`).join('')}</div>`, false).replace('<div class="opts">', `<span class="l" style="display:block;font:700 13px var(--font-body);color:var(--charcoal);margin:14px 0 4px">${esc(f.label)}${req}</span><div class="opts">`);
    case 'checks': return wrap(`<div class="opts">${f.options.map(o => `<label class="opt"><input type="checkbox" value="${esc(o)}" data-i="${f.id}">${esc(o)}</label>`).join('')}</div>`, false).replace('<div class="opts">', `<span class="l" style="display:block;font:700 13px var(--font-body);color:var(--charcoal);margin:14px 0 4px">${esc(f.label)}${req}</span><div class="opts">`);
    case 'bool': return wrap(`<label class="bool"><input type="checkbox" data-i="${f.id}"><span>${esc(f.label)}${req}</span></label>`, false).replace('class="fld"', 'class="fld" style="margin-top:14px"');
    case 'tests': return wrap(`<div class="picker"><input type="search" data-search="${f.id}" placeholder="Type a test name or code" autocomplete="off"><div class="sug" data-sug="${f.id}" hidden></div><div class="tags" data-tags="${f.id}"></div></div>`);
    case 'datetime': return wrap(`<div class="row" style="flex-wrap:nowrap"><input type="datetime-local" data-i="${f.id}"><button type="button" data-now="${f.id}" style="flex:none">Now</button></div>`);
    case 'tel': return wrap(`<input type="tel" inputmode="numeric" autocomplete="off" data-i="${f.id}" maxlength="14">`);
    case 'pincode': return wrap(`<input type="text" inputmode="numeric" maxlength="6" data-i="${f.id}">`);
    case 'email': return wrap(`<input type="email" autocomplete="off" data-i="${f.id}">`);
    case 'number': return wrap(`<input type="number" inputmode="numeric" min="${f.min ?? 0}" max="${f.max ?? 1e6}" data-i="${f.id}">`);
    case 'date': return wrap(`<input type="date" data-i="${f.id}" ${f.noFuture ? `max="${new Date().toISOString().slice(0, 10)}"` : ''}>`);
    default: return wrap(`<input type="text" data-i="${f.id}" maxlength="${f.maxLen ?? 200}" autocomplete="off">`);
  }
}

async function viewEdit(id) {
  let r;
  try { r = await api('/api/submissions/' + id); } catch (e) { app.innerHTML = `<p>${esc(e.message)} <a href="#/">Home</a></p>`; return; }
  const s = r.submission;
  if (!['submitted', 'rejected'].includes(s.status) || me.user.role === 'lab') { location.hash = '#/s/' + id; return; }
  return viewForm(s.form_id, { id, data: s.data });
}
async function viewForm(formId, edit = null) {
  const form = FORMS[formId];
  if (!form) { app.innerHTML = '<p>Unknown form. <a href="#/">Home</a></p>'; return; }
  const dkey = `etrf_draft_${formId}_${me.user.name}`;
  const lastClin = LS.get('etrf_last_clin_' + me.user.name, {});
  let data = edit ? JSON.parse(JSON.stringify(edit.data)) : LS.get(dkey, null);
  const restored = !edit && !!data;
  if (!data) data = { c_doctor: lastClin.c_doctor, c_hospital: lastClin.c_hospital, c_phone: lastClin.c_phone, c_email: lastClin.c_email, s_collector: me.user.name };
  Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
  let clientCode = me.user.client_code;
  const ref = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);

  let clients = [];
  if (me.user.role === 'admin') clients = await api('/api/admin/clients').catch(() => []);

  app.innerHTML = `<div class="eyebrow">${edit ? 'Editing ' + esc(edit.id) : 'Test requisition form'} · ${esc(form.docNo)}</div><h1>${edit ? 'Edit ' : ''}${esc(form.title)}</h1>
    ${edit ? '<div class="banner warn">You can change this form until the lab receives the sample. The lab is told it was edited and what changed.</div>' : ''}
    ${restored ? '<div class="banner ok">We restored your unsent draft. <button class="ghost" id="reset">Start over</button></div>' : ''}
    <div id="topErr"></div>
    <form id="frm" novalidate>
      ${me.user.role === 'admin' ? `<label class="f"><span class="l">Client <i>*</i></span><select id="cc"><option value="">Choose client…</option>${clients.map(c => `<option value="${esc(c.code)}">${esc(c.code)} · ${esc(c.name)}</option>`).join('')}</select></label>` : ''}
      <div class="card" id="finder"${edit ? ' hidden' : ''}><b>Repeat patient?</b><div class="hint">Search your patient list by name or mobile to fill the patient details. <a href="#/patients">Import a list</a></div><input type="search" id="pq" placeholder="Name or mobile" autocomplete="off" style="margin-top:8px"><div class="sug" id="pres" hidden></div></div>
      ${form.sections.map(s => `<h2>${esc(s.title)}</h2>${s.fields.map(fieldHtml).join('')}`).join('')}
      <h2${edit ? ' hidden' : ''}>Documents</h2>
      <div class="card" id="docs"${edit ? ' hidden' : ''}><div class="hint">Attach the prescription, a signed consent, ID proof or an earlier report. Take a photo or choose a file (JPG, PNG, WebP, HEIC or PDF, up to 8 MB each, up to 8 files).</div>
        <label class="f"><span class="l">Document type</span><select id="dk">${DOC_KINDS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <div class="row" style="margin-top:10px"><label class="btn" style="cursor:pointer">Take photo<input type="file" id="dcam" accept="image/*" capture="environment" hidden></label><label class="btn" style="cursor:pointer">Choose file<input type="file" id="dfile" accept="image/*,application/pdf,.pdf,.heic" multiple hidden></label></div>
        <div class="err" id="derr"></div><div class="tags" id="dlist"></div></div>
      <div class="stickybar noprint"><button type="button" id="cancel">Cancel</button><button class="primary" id="submit" type="submit">${edit ? 'Save changes' : 'Submit to Yello'}</button></div>
    </form>${FOOT}`;

  const BTN = edit ? 'Save changes' : 'Submit to Yello';
  const derived = () => form.derive ? form.derive(data) : data;
  const fields = allFields(form);
  const root = $('#frm');

  // fill UI from data
  const setUi = () => {
    for (const f of fields) {
      const v = data[f.id]; if (v === undefined) continue;
      root.querySelectorAll(`[data-i="${f.id}"]`).forEach(el => {
        if (el.type === 'radio') el.checked = el.value === v;
        else if (el.type === 'checkbox' && f.type === 'checks') el.checked = Array.isArray(v) && v.includes(el.value);
        else if (el.type === 'checkbox') el.checked = v === true;
        else el.value = v;
      });
      if (f.type === 'tests') drawTags(f.id);
    }
  };
  const drawTags = id => { const box = root.querySelector(`[data-tags="${id}"]`); const list = data[id] || []; box.innerHTML = list.map((t, i) => `<span class="tag">${esc(t.name)} <small>${esc(t.code)}</small><button type="button" data-rm="${id}:${i}" aria-label="Remove">×</button></span>`).join(''); };
  const applyVis = () => {
    const d = derived();
    for (const f of fields) {
      const el = root.querySelector(`[data-f="${f.id}"]`); if (!el) continue;
      const vis = isVisible(f, d);
      el.hidden = !vis;
    }
  };
  const showErrors = errs => {
    root.querySelectorAll('[data-e]').forEach(e => { e.textContent = errs[e.dataset.e] || ''; e.closest('.fld').classList.toggle('invalid', !!errs[e.dataset.e]); });
  };
  const save = () => { if (!edit) LS.set(dkey, data); };

  root.addEventListener('input', e => {
    const el = e.target, id = el.dataset.i; if (!id) return;
    const f = fields.find(x => x.id === id);
    if (f.type === 'checks') data[id] = [...root.querySelectorAll(`[data-i="${id}"]:checked`)].map(x => x.value);
    else if (el.type === 'checkbox') data[id] = el.checked;
    else if (el.type === 'radio') data[id] = el.value;
    else data[id] = el.value;
    if (data[id] === '' || (Array.isArray(data[id]) && !data[id].length)) delete data[id];
    applyVis(); save();
    const wrap = el.closest('.fld'); if (wrap.classList.contains('invalid')) { wrap.classList.remove('invalid'); wrap.querySelector('[data-e]').textContent = ''; }
  });
  root.addEventListener('focusout', e => {
    const id = e.target.dataset?.i; if (!id) return;
    const errs = validate(form, derived()); const f = fields.find(x => x.id === id);
    if (data[id] !== undefined && errs[id] && f.type !== 'bool') { const w = e.target.closest('.fld'); w.classList.add('invalid'); w.querySelector('[data-e]').textContent = errs[id]; }
  });
  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.now) { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); const inp = root.querySelector(`[data-i="${b.dataset.now}"]`); inp.value = d.toISOString().slice(0, 16); data[b.dataset.now] = inp.value; save(); }
    if (b.dataset.rm) { const [id, i] = b.dataset.rm.split(':'); data[id].splice(+i, 1); if (!data[id].length) delete data[id]; drawTags(id); save(); }
    if (b.dataset.pick) { const [id, code] = b.dataset.pick.split('|'); const t = lastResults.find(x => x.code === code); if (t) { data[id] = data[id] || []; if (!data[id].some(x => x.code === code)) data[id].push({ code: t.code, name: t.name }); drawTags(id); save(); } root.querySelector(`[data-sug="${id}"]`).hidden = true; root.querySelector(`[data-search="${id}"]`).value = ''; }
  });
  let lastResults = []; let st;
  root.addEventListener('input', e => {
    const id = e.target.dataset.search; if (!id) return;
    clearTimeout(st);
    st = setTimeout(async () => {
      const q = e.target.value.trim(); const box = root.querySelector(`[data-sug="${id}"]`);
      if (q.length < 2) { box.hidden = true; return; }
      try { lastResults = await api('/api/tests?q=' + encodeURIComponent(q)); } catch { lastResults = []; }
      box.innerHTML = lastResults.length ? lastResults.map(t => `<button type="button" data-pick="${id}|${esc(t.code)}">${esc(t.name)}<small>${esc(t.code)}${t.sample ? ' · ' + esc(t.sample) : ''}</small></button>`).join('') : '<button type="button" disabled>No match in the directory. Ask the lab to add it.</button>';
      box.hidden = false;
    }, 200);
  });

  // documents held until submit
  let docs = [];
  const drawDocs = () => { $('#dlist').innerHTML = docs.map((d, i) => `<span class="tag">${esc(DOC_KINDS.find(k => k[0] === d.kind)[1])} · ${esc(d.name.length > 22 ? d.name.slice(0, 20) + '…' : d.name)} <small>${fmtSize(d.blob.size)}</small><button type="button" data-dr="${i}" aria-label="Remove">×</button></span>`).join(''); };
  const addFiles = files => {
    $('#derr').textContent = '';
    for (const f of files) {
      const bad = docCheck(f); if (bad) { $('#derr').textContent = `${f.name}: ${bad}`; continue; }
      if (docs.length >= 8) { $('#derr').textContent = 'At most 8 documents per form'; break; }
      docs.push({ kind: $('#dk').value, name: f.name || 'photo.jpg', blob: f });
    }
    drawDocs();
  };
  $('#dfile').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  $('#dcam').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  $('#dlist').onclick = e => { const b = e.target.closest('[data-dr]'); if (b) { docs.splice(+b.dataset.dr, 1); drawDocs(); } };

  // repeat-patient finder
  let pt, pres = [];
  $('#pq').oninput = e => {
    clearTimeout(pt);
    pt = setTimeout(async () => {
      const q = e.target.value.trim(), box = $('#pres');
      if (q.length < 2) { box.hidden = true; return; }
      try { pres = await api(`/api/patients?q=${encodeURIComponent(q)}${me.user.role === 'admin' && clientCode ? '&client_code=' + encodeURIComponent(clientCode) : ''}`); } catch { pres = []; }
      box.innerHTML = pres.length ? pres.map((p, i) => `<button type="button" data-pp="${i}">${esc((p.p_title ? p.p_title + ' ' : '') + p.p_name)}<small>${esc(p.p_phone)}${p.p_age ? ' · ' + esc(p.p_age) + ' yrs' : p.p_dob ? ' · DOB ' + esc(p.p_dob) : ''}${p.p_sex ? ' · ' + esc(p.p_sex) : ''}</small></button>`).join('') : '<button type="button" disabled>No patient found. Fill the details below and they are saved for next time.</button>';
      box.hidden = false;
    }, 250);
  };
  $('#pres').onclick = e => {
    const b = e.target.closest('[data-pp]'); if (!b) return;
    const p = pres[+b.dataset.pp];
    for (const k of ['p_title', 'p_name', 'p_dob', 'p_age', 'p_sex', 'p_address', 'p_state', 'p_pin', 'p_phone', 'p_email']) { if (p[k]) data[k] = p[k]; else delete data[k]; }
    setUi(); applyVis(); save(); $('#pres').hidden = true; $('#pq').value = '';
  };

  setUi(); applyVis();
  if (me.user.role === 'admin') $('#cc').onchange = e => { clientCode = e.target.value; };
  $('#cancel').onclick = () => { history.back(); };
  const rs = $('#reset'); if (rs) rs.onclick = () => { LS.del(dkey); viewForm(formId); };

  root.addEventListener('submit', async e => {
    e.preventDefault();
    const d = derived();
    const errs = validate(form, d);
    if (me.user.role === 'admin' && !clientCode) { $('#topErr').innerHTML = '<div class="banner bad">Choose a client first.</div>'; window.scrollTo(0, 0); return; }
    showErrors(errs);
    const keys = Object.keys(errs);
    if (keys.length) {
      $('#topErr').innerHTML = `<div class="banner bad"><b>${keys.length} field${keys.length > 1 ? 's need' : ' needs'} attention.</b> They are marked in red below.</div>`;
      const first = root.querySelector(`[data-f="${keys[0]}"]`); first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    $('#topErr').innerHTML = '';
    const b = $('#submit'); b.disabled = true; b.textContent = 'Sending…';
    const payload = { form_id: formId, data: clean(form, d), client_ref: ref, client_code: clientCode };
    LS.set('etrf_last_clin_' + me.user.name, { c_doctor: data.c_doctor, c_hospital: data.c_hospital, c_phone: data.c_phone, c_email: data.c_email });
    try {
      if (edit) {
        await api('/api/submissions/' + edit.id, { method: 'PUT', body: { data: payload.data } });
        location.hash = '#/s/' + edit.id + '?edited=1'; return;
      }
      const r = await api('/api/submissions', { method: 'POST', body: payload });
      LS.del(dkey);
      let note = '';
      if (docs.length) {
        b.textContent = 'Uploading documents…';
        const out = await uploadDocs(r.submission.id, docs);
        if (out.retry.length) { await idbPut('retry:' + r.submission.id, out.retry); const fq = LS.get('etrf_fq', []); fq.push(r.submission.id); LS.set('etrf_fq', fq); note = '&docs=later'; }
        if (out.bad.length) { note += '&docfail=' + encodeURIComponent(out.bad.map(x => x.d.name + ': ' + x.msg).join('; ')); }
      }
      location.hash = '#/s/' + r.submission.id + '?new=1' + note;
    } catch (err) {
      if (err.status === 422 && err.body?.errors) { showErrors(err.body.errors); $('#topErr').innerHTML = '<div class="banner bad">The server found a problem with some fields. Please check the ones in red.</div>'; b.disabled = false; b.textContent = BTN; return; }
      if (!err.status && !edit) { // network failure: keep it safely, send later
        if (docs.length) { const ok = await idbPut(ref, docs.map(d => ({ kind: d.kind, name: d.name, blob: d.blob }))); if (!ok) { $('#topErr').innerHTML = '<div class="banner bad">You are offline and this phone could not store the documents. Remove them, or wait for signal.</div>'; b.disabled = false; b.textContent = BTN; return; } }
        const q = LS.get('etrf_queue', []); q.push({ ...payload, queued_at: new Date().toISOString() }); LS.set('etrf_queue', q); LS.del(dkey);
        netBanner();
        app.innerHTML = `<h1>Saved offline</h1><div class="banner ok">This form is saved on your phone and will be sent automatically when you are back online. Keep this page's phone with you; do not clear browser data.</div><div class="row"><a class="btn" href="#/">Home</a></div>`;
        return;
      }
      $('#topErr').innerHTML = `<div class="banner bad">${esc(err.status ? err.message : 'No connection. Reconnect and try again.')}</div>`; b.disabled = false; b.textContent = BTN;
    }
  });
}

/* ---------- detail ---------- */
function valueText(f, v) {
  if (f.type === 'tests') return v.map(t => `${t.name} (${t.code})`).join('; ');
  if (Array.isArray(v)) return v.join(', ');
  if (v === true) return 'Yes';
  if (f.type === 'datetime') return new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  return String(v);
}
async function viewDetail(id) {
  const isNew = location.hash.includes('?new=1');
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  let sub;
  let hist = [];
  try { const resp = await api('/api/submissions/' + id); sub = resp.submission; hist = resp.history || []; } catch (e) { app.innerHTML = `<p>${esc(e.message)} <a href="#/">Home</a></p>`; return; }
  const form = FORMS[sub.form_id];
  const staff = me.user.role !== 'client';
  const d = sub.data;
  const fieldLabel = new Map(allFields(form).map(f => [f.id, f.label.length > 50 ? f.label.slice(0, 47) + '…' : f.label]));
  const lastChanged = hist.length ? hist[hist.length - 1].changed : [];
  const lastLabels = lastChanged.map(k => fieldLabel.get(k) || k);
  const canEdit = me.user.role !== 'lab' && ['submitted', 'rejected'].includes(sub.status);
  const secs = form.sections.map(s => {
    const rows = s.fields.filter(f => f.type !== 'note' && d[f.id] !== undefined).map(f => `<div><b>${esc(f.label.length > 70 ? f.label.slice(0, 67) + '…' : f.label)}</b><span>${esc(valueText(f, d[f.id]))}</span></div>`).join('');
    return rows ? `<h2>${esc(s.title)}</h2><div class="dl">${rows}</div>` : '';
  }).join('');
  const labelHtml = `<div class="label"><div class="t">${esc(sub.patient_name)}</div>${barcodeSvg(sub.id)}<div class="t" style="letter-spacing:.06em">${esc(sub.id)}</div><div class="s">${esc(sub.form)} · ${esc(sub.client_code)} · ${new Date(sub.created_at).toLocaleDateString('en-IN')}</div></div>`;
  const wa = encodeURIComponent(`Yello e-TRF ${sub.id} (${sub.form}) has been submitted. Sample label and details are in the e-TRF app.`);
  app.innerHTML = `${isNew ? '<div class="banner ok noprint"><b>Sent to Yello.</b> Print the label and stick it on the sample before it goes in the box.</div>' : ''}
    <div class="eyebrow">${esc(sub.form)} · ${esc(form.docNo)}</div><div class="big">${esc(sub.id)}</div>
    <p class="row" style="margin:6px 0">${chip(sub.status)}${sub.revision ? ` <span class="chip gold">Edited ×${sub.revision}</span>` : ''} <span class="sub">${esc(sub.patient_name)} · ${new Date(sub.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></p>
    ${qs.get('edited') ? '<div class="banner ok noprint"><b>Changes saved.</b> The lab sees the latest version.' + (lastChanged.includes('p_name') || lastChanged.includes('p_title') ? ' <b>The patient name changed: print a new label.</b>' : '') + '</div>' : ''}
    ${hist.length && staff ? `<div class="banner warn"><b>Edited after it was sent.</b> Last change: ${esc(lastLabels.join(', '))}.</div>` : ''}
    ${sub.reject_reason ? `<div class="banner bad"><b>Rejected:</b> ${esc(sub.reject_reason)}</div>` : ''}
    <div class="labelzone card noprint" style="display:block"><b>Sample label</b><div style="margin-top:8px">${labelHtml}</div></div>
    <div class="row noprint"><button class="primary" id="pl">Print label</button><button id="pt">Print form copy</button>${canEdit ? `<a class="btn" href="#/edit/${sub.id}">${sub.status === 'rejected' ? 'Fix and resend' : 'Edit form'}</a>` : ''}<a class="btn" href="https://wa.me/?text=${wa}" target="_blank" rel="noopener">Share on WhatsApp</a>${isNew ? `<a class="btn" href="#/new/${sub.form_id}">Another ${esc(sub.form)} form</a>` : ''}<a class="btn" href="#/">Home</a></div>
    ${staff ? `<h2 class="noprint">Lab</h2><div class="row noprint" id="lab">${sub.status !== 'submitted' ? '<button data-s="submitted">Reopen for edit</button>' : ''}<button data-s="received">Mark received</button><button data-s="accepted">Accept</button><button class="danger" data-s="rejected">Reject…</button><button data-s="reported">Reported</button></div><div class="err" id="le"></div>` : ''}
    <div class="printonly"><img src="yello-logo.png" alt="Yello" style="height:34px"><b style="margin-left:12px">${esc(form.title)} · ${esc(form.docNo)} · ${esc(sub.id)}</b></div>
    ${qs.get('docs') === 'later' ? '<div class="banner warn noprint">Some documents could not be sent. They are saved on this phone and will upload when you are online.</div>' : ''}${qs.get('docfail') ? `<div class="banner bad noprint">These documents were not accepted: ${esc(qs.get('docfail'))}. Add them again below.</div>` : ''}
    <h2 class="noprint">Documents</h2><div class="card noprint" id="dbox"><div id="dlistd" class="sub">Loading…</div>
      <div class="row" style="margin-top:10px"><select id="dkd" style="width:auto">${DOC_KINDS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><label class="btn" style="cursor:pointer">Take photo<input type="file" id="dcamd" accept="image/*" capture="environment" hidden></label><label class="btn" style="cursor:pointer">Add file<input type="file" id="dfiled" accept="image/*,application/pdf,.pdf,.heic" hidden></label></div><div class="err" id="derrd"></div></div>
    ${secs}${FOOT}`;
  const loadDocs = async () => {
    const files = await api(`/api/submissions/${id}/files`).catch(() => []);
    $('#dlistd').innerHTML = files.length ? files.map(f => `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:8px 0"><span><b>${esc(DOC_KINDS.find(k => k[0] === f.kind)?.[1] ?? f.kind)}</b><br><span class="hint">${esc(f.name)} · ${fmtSize(f.size)}</span></span><button data-view="${f.id}">View</button></div>`).join('') : 'No documents attached.';
  };
  $('#dlistd').onclick = async e => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    const w = window.open('', '_blank');
    try {
      const r = await api(`/api/files/${b.dataset.view}/link`, { method: 'POST' });
      if (w) w.location = r.url;
    } catch (err) { if (w) w.close(); $('#derrd').textContent = err.message; }
  };
  const addOne = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const bad = docCheck(f); if (bad) { $('#derrd').textContent = bad; return; }
    $('#derrd').textContent = 'Uploading…';
    try { await uploadDoc(id, { kind: $('#dkd').value, name: f.name || 'photo.jpg', blob: f }); $('#derrd').textContent = ''; loadDocs(); } catch (err) { $('#derrd').textContent = err.message; }
  };
  $('#dfiled').onchange = addOne; $('#dcamd').onchange = addOne; loadDocs();
  $('#pl').onclick = () => { document.body.classList.add('print-label'); window.print(); setTimeout(() => document.body.classList.remove('print-label'), 300); };
  $('#pt').onclick = () => window.print();
  const lab = $('#lab');
  if (lab) lab.onclick = async e => {
    const s = e.target.dataset.s; if (!s) return;
    let reason = '';
    if (s === 'rejected') { reason = prompt('Reason for rejection (the sender will see this):') || ''; if (!reason.trim()) return; }
    try { await api(`/api/submissions/${id}/status`, { method: 'POST', body: { status: s, reason } }); viewDetail(id); } catch (err) { $('#le').textContent = err.message; }
  };
}

/* ---------- admin ---------- */
async function viewAdmin() {
  if (me.user.role !== 'admin') { location.hash = '#/'; return; }
  const [clients, users] = await Promise.all([api('/api/admin/clients'), api('/api/admin/users')]);
  app.innerHTML = `<h1>Admin</h1><p class="row"><a href="#/">Home</a> · <a href="#/list">All submissions</a></p>
    <h2>Clients (partner codes)</h2>
    <div class="card" style="padding:4px 8px"><table class="list"><thead><tr><th>Code</th><th>Name</th><th>Users</th><th>Forms</th></tr></thead><tbody>${clients.map(c => `<tr><td><b>${esc(c.code)}</b></td><td>${esc(c.name)}</td><td>${c.users}</td><td>${c.submissions}</td></tr>`).join('')}</tbody></table></div>
    <form id="cf" class="card"><b>Add a client</b><div class="row" style="margin-top:8px"><input id="cc" placeholder="Code e.g. HOSP01" style="flex:1;min-width:130px" required><input id="cn" placeholder="Centre / hospital name" style="flex:2;min-width:180px" required><button class="primary">Add</button></div><div class="err" id="ce"></div></form>
    <h2>Users</h2>
    <div class="card" style="padding:4px 8px"><table class="list"><thead><tr><th>Name</th><th>Mobile</th><th>Role</th><th></th></tr></thead><tbody>${users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.mobile)}</td><td>${esc(u.role)}${u.client_code ? ' · ' + esc(u.client_code) : ''}${u.active ? '' : ' <span class="chip rose">off</span>'}</td><td><button class="sm ghost" data-act="${u.id}:${u.active ? 0 : 1}">${u.active ? 'Deactivate' : 'Reactivate'}</button></td></tr>`).join('')}</tbody></table></div>
    <form id="uf" class="card"><b>Add a user</b><div class="row" style="margin-top:8px"><input id="un" placeholder="Name" style="flex:1;min-width:130px" required><input id="um" type="tel" placeholder="Mobile" style="flex:1;min-width:130px" required><select id="ur" style="width:auto"><option value="client">Centre staff</option><option value="lab">Lab intake</option><option value="admin">Admin</option></select><input id="uc" placeholder="Client code" style="width:130px"><button class="primary">Add</button></div><div class="err" id="ue"></div></form>${FOOT}`;
  $('#cf').onsubmit = async e => { e.preventDefault(); try { await api('/api/admin/clients', { method: 'POST', body: { code: $('#cc').value, name: $('#cn').value } }); viewAdmin(); } catch (err) { $('#ce').textContent = err.message; } };
  $('#uf').onsubmit = async e => { e.preventDefault(); try { await api('/api/admin/users', { method: 'POST', body: { name: $('#un').value, mobile: $('#um').value, role: $('#ur').value, client_code: $('#uc').value } }); viewAdmin(); } catch (err) { $('#ue').textContent = err.message; } };
  app.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => { const [id, a] = b.dataset.act.split(':'); try { await api(`/api/admin/users/${id}/active`, { method: 'POST', body: { active: a === '1' } }); viewAdmin(); } catch (err) { alert(err.message); } });
}

/* ---------- patients ---------- */
function parseCsv(text) {
  text = text.replace(/^﻿/, ''); const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}
const HEAD = { name: ['name', 'patient name', 'full name'], title: ['title'], sex: ['sex', 'gender'], dob: ['dob', 'date of birth', 'birth date'], age: ['age', 'age years'], phone: ['phone', 'mobile', 'mobile number', 'phone number', 'contact'], address: ['address'], state: ['state'], pin: ['pin', 'pincode', 'pin code', 'postal code'], email: ['email', 'email id'] };
function csvToPatients(text) {
  const rows = parseCsv(text); if (rows.length < 2) return { error: 'The file has no patient rows.' };
  const head = rows[0].map(h => h.trim().toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim());
  const idx = {}; for (const [k, names] of Object.entries(HEAD)) idx[k] = head.findIndex(h => names.includes(h));
  if (idx.name < 0 || idx.phone < 0) return { error: 'The first row must have headings, including at least "name" and "phone". Use the template.' };
  const fixDate = s => { s = (s || '').trim(); const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s; };
  return { rows: rows.slice(1).map(r => { const o = {}; for (const k of Object.keys(HEAD)) o[k] = idx[k] >= 0 ? (r[idx[k]] || '').trim() : ''; o.dob = fixDate(o.dob); return o; }) };
}
async function viewPatients() {
  if (me.user.role === 'lab') { location.hash = '#/list'; return; }
  const admin = me.user.role === 'admin';
  const clients = admin ? await api('/api/admin/clients').catch(() => []) : [];
  app.innerHTML = `<div class="eyebrow">${me.client ? esc(me.client.name) : 'Yello admin'}</div><h1>Patients</h1>
    <p class="sub">Your saved patients. They fill in automatically on any form. Every form you send adds the patient here.</p>
    ${admin ? `<label class="f"><span class="l">Client</span><select id="pc"><option value="">Choose client…</option>${clients.map(c => `<option value="${esc(c.code)}">${esc(c.code)} · ${esc(c.name)}</option>`).join('')}</select></label>` : ''}
    <input type="search" id="ps" placeholder="Search name or mobile" style="margin-top:12px"><div id="plist" class="card" style="padding:4px 8px"></div>
    <h2>Import a patient list</h2>
    <div class="card"><p class="sub" style="margin-top:0">One patient per row. In Excel use <b>Save As → CSV UTF-8</b>. Needed: name, sex, phone, and date of birth or age. Dates as DD/MM/YYYY or YYYY-MM-DD. Up to 1,000 patients.</p>
      <div class="row"><button id="tpl">Download template</button><label class="btn" style="cursor:pointer">Choose CSV file<input type="file" id="pf" accept=".csv,text/csv" hidden></label></div>
      <div class="err" id="pe"></div><div id="pp"></div></div><div class="row noprint"><a href="#/">Home</a></div>${FOOT}`;
  const code = () => admin ? $('#pc').value : me.user.client_code;
  const load = async () => {
    if (!code()) { $('#plist').innerHTML = '<p class="sub" style="padding:10px">Choose a client first.</p>'; return; }
    const rows = await api(`/api/patients?q=${encodeURIComponent($('#ps').value)}${admin ? '&client_code=' + encodeURIComponent(code()) : ''}`).catch(() => []);
    $('#plist').innerHTML = rows.length ? `<table class="list"><thead><tr><th>Patient</th><th>Mobile</th><th>Age / DOB</th></tr></thead><tbody>${rows.map(p => `<tr><td>${esc((p.p_title ? p.p_title + ' ' : '') + p.p_name)}<br><span class="hint">${esc(p.p_sex || '')}</span></td><td>${esc(p.p_phone)}</td><td>${esc(p.p_age ? p.p_age + ' yrs' : p.p_dob || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="sub" style="padding:10px">No patients yet. Import a list or send a form.</p>';
  };
  let t; $('#ps').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  if (admin) $('#pc').onchange = load;
  $('#tpl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['name,title,sex,dob,age,phone,address,state,pin,email\nRavi Kumar,Mr.,Male,12/03/1984,,9876543210,"12 Park Road, Hyderabad",Telangana,500034,\n'], { type: 'text/csv' })); a.download = 'yello-patient-list-template.csv'; a.click(); };
  $('#pf').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    $('#pe').textContent = ''; $('#pp').innerHTML = '';
    if (admin && !code()) { $('#pe').textContent = 'Choose a client first.'; return; }
    if (f.size > 2 * 1024 * 1024) { $('#pe').textContent = 'File is too large for a patient list (max 2 MB).'; return; }
    const out = csvToPatients(await f.text());
    if (out.error) { $('#pe').textContent = out.error; return; }
    if (out.rows.length > 1000) { $('#pe').textContent = 'At most 1,000 patients per upload. Split the file.'; return; }
    $('#pp').innerHTML = `<div class="banner warn"><b>${out.rows.length} rows ready.</b> Check the first few, then import.</div><table class="list"><tbody>${out.rows.slice(0, 3).map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.phone)}</td><td>${esc(r.sex)}</td></tr>`).join('')}</tbody></table><div class="row" style="margin-top:10px"><button class="primary" id="go">Import ${out.rows.length} patients</button></div>`;
    $('#go').onclick = async () => {
      $('#go').disabled = true;
      try {
        const r = await api('/api/patients/bulk', { method: 'POST', body: { rows: out.rows, client_code: admin ? code() : undefined } });
        $('#pp').innerHTML = `<div class="banner ${r.rejected_total ? 'warn' : 'ok'}"><b>${r.added} added, ${r.updated} updated${r.rejected_total ? `, ${r.rejected_total} not imported` : ''}.</b></div>` +
          (r.rejected.length ? `<table class="list"><thead><tr><th>Row</th><th>Problem</th></tr></thead><tbody>${r.rejected.map(x => `<tr><td>${x.row}</td><td>${esc(x.reason)}</td></tr>`).join('')}</tbody></table><p class="hint">Fix these rows in your file and import again. Rows already imported are not duplicated.</p>` : '');
        load();
      } catch (err) { $('#pe').textContent = err.message; $('#go').disabled = false; }
    };
  };
  load();
}

netBanner();
if (token) { me = null; flushQueue(); }
route();
