// Browser-only stand-in for the e-TRF server, used for team testing on the static website.
// It answers the same /api/* calls as server.mjs, but keeps everything in this browser
// (localStorage for records, IndexedDB for documents). Nothing leaves the device.
import { FORMS, FORM_LIST } from './schemas.mjs';
import { validate, clean, normPhone, PHONE_RE } from './validate.mjs';

const KEY = 'etrf_sandbox_v1';
const realFetch = window.fetch.bind(window);
const enc = new TextEncoder();
const now = () => new Date().toISOString();
const MAX_FILE = 8 * 1024 * 1024, MAX_FILES = 8;
const KINDS = ['prescription', 'consent', 'id_proof', 'previous_report', 'other'];
const STATUSES = ['submitted', 'received', 'accepted', 'rejected', 'reported'];
const EDITABLE = ['submitted', 'rejected'];

/* ---------- state ---------- */
let S = null;
function load() { try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch { /* ignore */ } return null; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage blocked: keep in memory */ } }
function fresh() {
  return { clients: [], users: [], subs: [], revs: [], files: [], patients: [], sessions: {}, otps: {}, uid: 1, pid: 1 };
}
const patientKey = n => String(n ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* ---------- documents in IndexedDB ---------- */
function idb() { return new Promise((res, rej) => { const r = indexedDB.open('etrf_sandbox', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function putBlob(id, buf) { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(buf, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
async function getBlob(id) { const db = await idb(); return new Promise((res, rej) => { const r = db.transaction('files').objectStore('files').get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

function sniff(b) {
  const u = new Uint8Array(b); const s = (a, z) => String.fromCharCode(...u.slice(a, z));
  if (u.length > 12 && u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) return 'image/jpeg';
  if (u.length > 8 && u[0] === 0x89 && s(1, 4) === 'PNG') return 'image/png';
  if (u.length > 5 && s(0, 5) === '%PDF-') return 'application/pdf';
  if (u.length > 12 && s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return 'image/webp';
  if (u.length > 12 && s(4, 8) === 'ftyp' && /^(heic|heix|hevc|mif1|msf1)/.test(s(8, 12))) return 'image/heic';
  return null;
}

/* ---------- helpers ---------- */
const rnd = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; };
const hex = n => [...rnd(n)].map(x => x.toString(16).padStart(2, '0')).join('');
function newId() {
  const d = new Date(); const ymd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const al = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) { let s = ''; for (const x of rnd(4)) s += al[x % al.length]; const id = `YLO-${ymd}-${s}`; if (!S.subs.some(x => x.id === id)) return id; }
}
const isStaff = u => u.role === 'lab' || u.role === 'admin';
const canSee = (u, sub) => isStaff(u) || sub.client_code === u.client_code;
const rowOut = (r, withData) => ({ id: r.id, form_id: r.form_id, form: FORMS[r.form_id]?.title ?? r.form_id, client_code: r.client_code, status: r.status, reject_reason: r.reject_reason ?? null, patient_name: r.patient_name, revision: r.revision ?? 0, created_at: r.created_at, updated_at: r.updated_at, ...(withData ? { data: r.data } : {}) });
const changedIds = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
const ok = (b, status = 200) => ({ status, json: b });
const fail = (status, error, extra = {}) => ({ status, json: { error, ...extra } });

function upsertPatient(code, d) {
  if (!d.p_phone || !d.p_name) return 'none';
  const key = patientKey(d.p_name); const t = now();
  const row = { client_code: code, name_key: key, phone: d.p_phone, title: d.p_title ?? null, name: d.p_name, dob: d.p_dob ?? null, age: d.p_age ?? null, sex: d.p_sex ?? null, address: d.p_address ?? null, state: d.p_state ?? null, pin: d.p_pin ?? null, email: d.p_email ?? null, updated_at: t };
  const ex = S.patients.find(p => p.client_code === code && p.phone === d.p_phone && p.name_key === key);
  if (ex) { Object.assign(ex, row); return 'updated'; }
  S.patients.push({ id: S.pid++, created_at: t, ...row }); return 'added';
}
const patientOut = r => ({ id: r.id, p_title: r.title, p_name: r.name, p_dob: r.dob, p_age: r.age, p_sex: r.sex, p_address: r.address, p_state: r.state, p_pin: r.pin, p_phone: r.phone, p_email: r.email });

function createSubmission(user, clientCode, body) {
  const form = FORMS[body.form_id]; if (!form) return fail(400, 'Unknown form');
  const client = S.clients.find(c => c.code === clientCode && c.active);
  if (!client) return fail(400, 'No active client code for this login');
  const raw = body.data && typeof body.data === 'object' ? body.data : {};
  const d = form.derive ? form.derive(raw) : raw;
  const errors = validate(form, d);
  if (Object.keys(errors).length) return fail(422, 'Please fix the highlighted fields', { errors });
  const ref = typeof body.client_ref === 'string' ? body.client_ref.slice(0, 64) : null;
  if (ref) { const dup = S.subs.find(s => s.created_by === user.id && s.client_ref === ref); if (dup) return ok({ duplicate: true, submission: rowOut(dup) }); }
  const data = clean(form, d); const t = now(); const id = newId();
  const sub = { id, client_ref: ref, form_id: form.id, client_code: client.code, created_by: user.id, status: 'submitted', reject_reason: null, patient_name: `${data.p_title ?? ''} ${data.p_name}`.trim(), data, revision: 0, created_at: t, updated_at: t };
  S.subs.unshift(sub); upsertPatient(client.code, data); save();
  return ok({ submission: rowOut(sub) }, 201);
}

/* ---------- seed (demo partners and sample forms) ---------- */
function seed() {
  S = fresh(); const t = now();
  const C = [['DEMO001', 'Demo Collection Centre'], ['HOSP001', 'Demo Hospital'], ['CLIN001', 'Demo Clinic'], ['LAB001', 'Demo Partner Lab']];
  C.forEach(([code, name]) => S.clients.push({ code, name, active: 1, created_at: t }));
  const U = [['9000000001', 'Demo Centre Staff', 'client', 'DEMO001'], ['9000000011', 'Hospital Phlebotomy Desk', 'client', 'HOSP001'], ['9000000021', 'Clinic Reception', 'client', 'CLIN001'], ['9000000031', 'Partner Lab Collection', 'client', 'LAB001'], ['9000000002', 'Yello Lab Intake', 'lab', null], ['9000000003', 'Yello Admin', 'admin', null]];
  U.forEach(([mobile, name, role, cc]) => S.users.push({ id: S.uid++, mobile, name, role, client_code: cc, active: 1, created_at: t }));
  const u = m => S.users.find(x => x.mobile === m);
  const iso = h => { const d = new Date(); d.setHours(h, 0, 0, 0); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const P = (title, name, sex, age, phone) => ({ p_title: title, p_name: name, p_sex: sex, p_age: String(age), p_phone: phone, p_state: 'Telangana', p_pin: '500034' });
  const tail = (doc, hosp, who) => ({ c_doctor: doc, c_hospital: hosp, s_collector: who, ok_consent: true });
  const histo = p => ({ ...p, h_test: 'Histopathology of biopsy', h_type: ['Biopsy'], h_desc: '1 container, 10% formalin', h_collected: iso(9), h_findings: 'Lesion seen on imaging', h_site: 'Skin, left forearm', h_formalin: true });
  const culture = p => ({ ...p, sp_type: ['Urine'], sp_urine: 'Clean-catch midstream', sp_when: iso(8), r_prev: 'No', r_abx: 'None', inv: ['Aerobic culture & sensitivity'] });
  const coag = p => ({ ...p, t_tests: [{ code: 'NDN0001', name: '1,25-Dihydroxy Vitamin D' }], t_status: 'Non-fasting', t_collected: iso(10), h_bleed_c: 'No', h_bleed_a: 'No', h_thromb_c: 'No', h_thromb_a: 'No', h_transf: 'No', h_surgery: 'No', l_pt: 'No', l_aptt: 'No', l_lft: 'No', m_warfarin: 'No', m_hirudin: 'No', m_coumarin: 'No', m_lmwh: 'No', m_ufh: 'No', m_other: 'No' });
  const cyto = p => ({ ...p, n_fluid: ['Pleural fluid'], n_collected: iso(9), k_find: 'Breathlessness, effusion on X-ray' });
  const plan = [
    ['9000000011', 'HOSP001', 'histopathology', histo({ ...P('Mr.', 'Venkat Reddy', 'Male', 58, '9700000101'), ...tail('Dr S. Rao', 'Demo Hospital', 'Hospital Phlebotomy Desk') })],
    ['9000000011', 'HOSP001', 'culture', culture({ ...P('Mrs.', 'Lakshmi Devi', 'Female', 44, '9700000102'), ...tail('Dr M. Iqbal', 'Demo Hospital', 'Hospital Phlebotomy Desk') })],
    ['9000000011', 'HOSP001', 'cytology', cyto({ ...P('Mr.', 'Imran Khan', 'Male', 63, '9700000103'), ...tail('Dr S. Rao', 'Demo Hospital', 'Hospital Phlebotomy Desk') })],
    ['9000000021', 'CLIN001', 'coagulation', coag({ ...P('Ms.', 'Anjali Sharma', 'Female', 31, '9700000201'), ...tail('Dr P. Nair', 'Demo Clinic', 'Clinic Reception') })],
    ['9000000021', 'CLIN001', 'culture', culture({ ...P('Master', 'Rohan Mehta', 'Male', 7, '9700000202'), ...tail('Dr P. Nair', 'Demo Clinic', 'Clinic Reception') })],
    ['9000000031', 'LAB001', 'cytology', cyto({ ...P('Mrs.', 'Fatima Begum', 'Female', 52, '9700000301'), ...tail('Dr A. Kulkarni', 'Demo Partner Lab', 'Partner Lab Collection') })],
    ['9000000031', 'LAB001', 'coagulation', coag({ ...P('Mr.', 'Suresh Babu', 'Male', 67, '9700000302'), ...tail('Dr A. Kulkarni', 'Demo Partner Lab', 'Partner Lab Collection') })],
    ['9000000031', 'LAB001', 'histopathology', histo({ ...P('Ms.', 'Divya Menon', 'Female', 29, '9700000303'), ...tail('Dr A. Kulkarni', 'Demo Partner Lab', 'Partner Lab Collection') })],
  ];
  const made = {};
  for (const [m, cc, form_id, data] of plan) { const r = createSubmission(u(m), cc, { form_id, data, client_ref: 'seed-' + m + form_id + data.p_phone }); made[data.p_name] = r.json.submission.id; }
  [['Sunita Verma', 'Mrs.', 'Female', '39', '9700000111'], ['Ravi Teja', 'Mr.', 'Male', '36', '9700000112'], ['Kavya Reddy', 'Ms.', 'Female', '26', '9700000113'], ['Mohammed Ali', 'Mr.', 'Male', '71', '9700000114']]
    .forEach(([name, title, sex, age, phone]) => upsertPatient('HOSP001', { p_name: name, p_title: title, p_sex: sex, p_age: age, p_phone: phone }));
  const set = (name, status, reason) => { const s = S.subs.find(x => x.id === made[name]); s.status = status; s.reject_reason = reason ?? null; };
  set('Venkat Reddy', 'received'); set('Rohan Mehta', 'rejected', 'Urine container leaked in transit. Please recollect.'); set('Fatima Begum', 'accepted');
  save();
}

/* ---------- API ---------- */
async function testsList() { if (!window.__etrfTests) window.__etrfTests = await (await realFetch(new URL('./tests.json', import.meta.url))).json(); return window.__etrfTests; }
function authUser(token) {
  const s = token && S.sessions[token]; if (!s || s.exp < Date.now()) return null;
  const u = S.users.find(x => x.id === s.uid); return u && u.active ? u : null;
}

async function handle(method, path, query, body, token, rawBody) {
  if (path === '/api/health') return ok({ ok: true });
  if (path === '/api/auth/request' && method === 'POST') {
    const mo = normPhone(body.mobile); if (!PHONE_RE.test(mo)) return fail(400, 'Enter a 10-digit mobile number');
    const u = S.users.find(x => x.mobile === mo && x.active);
    if (!u) return ok({ ok: true });
    const code = String(100000 + (new Uint32Array(rnd(4).buffer)[0] % 900000));
    S.otps[mo] = { code, exp: Date.now() + 10 * 60000, attempts: 0 }; save();
    return ok({ ok: true, dev_otp: code });
  }
  if (path === '/api/auth/verify' && method === 'POST') {
    const mo = normPhone(body.mobile); const o = S.otps[mo];
    if (!o || o.exp < Date.now()) return fail(401, 'Code expired. Request a new one.');
    if (o.attempts >= 5) { delete S.otps[mo]; save(); return fail(429, 'Too many attempts. Request a new code.'); }
    if (String(body.otp ?? '').trim() !== o.code) { o.attempts++; save(); return fail(401, 'Wrong code'); }
    delete S.otps[mo]; const u = S.users.find(x => x.mobile === mo && x.active); if (!u) return fail(401, 'Wrong code');
    const tok = hex(32); S.sessions[tok] = { uid: u.id, exp: Date.now() + 14 * 86400000 }; save();
    return ok({ token: tok, user: { name: u.name, role: u.role, client_code: u.client_code } });
  }
  const user = authUser(token); if (!user) return fail(401, 'Sign in required');
  if (path === '/api/me') { const c = user.client_code ? S.clients.find(x => x.code === user.client_code) : null; return ok({ user: { name: user.name, role: user.role, client_code: user.client_code }, client: c ? { code: c.code, name: c.name } : null }); }
  if (path === '/api/auth/logout' && method === 'POST') { delete S.sessions[token]; save(); return ok({ ok: true }); }
  if (path === '/api/forms') return ok(FORM_LIST);
  if (path === '/api/tests') {
    const q = (query.get('q') || '').toLowerCase().trim(); if (q.length < 2) return ok([]);
    const words = q.split(/\s+/); const out = [];
    for (const t of await testsList()) { const h = (t.code + ' ' + t.name).toLowerCase(); if (words.every(w => h.includes(w))) { out.push({ code: t.code, name: t.name, sample: t.sample }); if (out.length >= 30) break; } }
    return ok(out);
  }

  if (path === '/api/submissions' && method === 'POST') {
    if (user.role === 'lab') return fail(403, 'Lab users do not submit forms');
    return createSubmission(user, user.role === 'admin' ? body.client_code : user.client_code, body);
  }
  if (path === '/api/submissions' && method === 'GET') {
    const q = (query.get('q') || '').trim().toLowerCase(), st = query.get('status');
    let rows = S.subs.filter(s => isStaff(user) || s.client_code === user.client_code);
    if (st) rows = rows.filter(r => r.status === st);
    if (q) rows = rows.filter(r => (r.id + ' ' + r.patient_name + ' ' + r.client_code).toLowerCase().includes(q));
    return ok(rows.slice(0, 500).map(r => rowOut(r)));
  }
  if (path === '/api/submissions.csv') {
    if (!isStaff(user)) return fail(403, 'Not allowed');
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    return { status: 200, text: ['id,form,client_code,status,reject_reason,patient,created_at', ...S.subs.map(r => [r.id, r.form_id, r.client_code, r.status, r.reject_reason, r.patient_name, r.created_at].map(q).join(','))].join('\n') };
  }
  let m;
  if ((m = path.match(/^\/api\/submissions\/(YLO-[0-9]{6}-[A-Z0-9]{4})$/))) {
    const r = S.subs.find(x => x.id === m[1]);
    if (!r || !canSee(user, r)) return fail(404, 'Not found');
    if (method === 'GET') {
      const revs = S.revs.filter(v => v.submission_id === r.id).sort((a, b) => a.rev - b.rev);
      const history = revs.map((v, i) => ({ rev: v.rev + 1, edited_at: i + 1 < revs.length ? revs[i + 1].edited_at : r.updated_at, changed: changedIds(v.data, i + 1 < revs.length ? revs[i + 1].data : r.data) }));
      return ok({ submission: rowOut(r, true), history });
    }
    if (method === 'PUT') {
      if (user.role === 'lab') return fail(403, "The lab cannot edit a sender's form. Reject it with a reason instead.");
      if (!EDITABLE.includes(r.status)) return fail(409, 'The lab has already received this sample, so the form is locked. Ask the lab to reopen it.');
      const form = FORMS[r.form_id]; const raw = body.data && typeof body.data === 'object' ? body.data : {};
      const d = form.derive ? form.derive(raw) : raw; const errors = validate(form, d);
      if (Object.keys(errors).length) return fail(422, 'Please fix the highlighted fields', { errors });
      const data = clean(form, d); const changed = changedIds(r.data, data);
      if (!changed.length) return ok({ submission: rowOut(r), unchanged: true });
      const t = now(); S.revs.push({ submission_id: r.id, rev: r.revision, data: r.data, edited_at: t });
      Object.assign(r, { data, patient_name: `${data.p_title ?? ''} ${data.p_name}`.trim(), revision: r.revision + 1, status: 'submitted', reject_reason: null, updated_at: t });
      upsertPatient(r.client_code, data); save(); return ok({ submission: rowOut(r), changed });
    }
  }
  if ((m = path.match(/^\/api\/submissions\/(YLO-[0-9]{6}-[A-Z0-9]{4})\/status$/)) && method === 'POST') {
    if (!isStaff(user)) return fail(403, 'Only the lab can change status');
    if (!STATUSES.includes(body.status)) return fail(400, 'Unknown status');
    if (body.status === 'rejected' && !String(body.reason ?? '').trim()) return fail(400, 'Give a reason for rejection');
    const r = S.subs.find(x => x.id === m[1]); if (!r) return fail(404, 'Not found');
    r.status = body.status; r.reject_reason = body.status === 'rejected' ? String(body.reason).trim().slice(0, 300) : null; r.updated_at = now(); save();
    return ok({ submission: rowOut(r) });
  }
  if ((m = path.match(/^\/api\/submissions\/(YLO-[0-9]{6}-[A-Z0-9]{4})\/files$/))) {
    const r = S.subs.find(x => x.id === m[1]); if (!r || !canSee(user, r)) return fail(404, 'Not found');
    if (method === 'GET') return ok(S.files.filter(f => f.submission_id === r.id).map(f => ({ id: f.id, kind: f.kind, name: f.name, mime: f.mime, size: f.size, created_at: f.created_at })));
    if (method === 'POST') {
      const kind = query.get('kind') || 'other'; if (!KINDS.includes(kind)) return fail(400, 'Unknown document type');
      if (S.files.filter(f => f.submission_id === r.id).length >= MAX_FILES) return fail(400, `At most ${MAX_FILES} documents per form`);
      if (!rawBody || !rawBody.byteLength) return fail(400, 'Empty file');
      if (rawBody.byteLength > MAX_FILE) return fail(413, 'File too large (max 8 MB)');
      const mime = sniff(rawBody); if (!mime) return fail(415, 'Only photos (JPG, PNG, WebP, HEIC) and PDF files are accepted');
      const id = crypto.randomUUID(); await putBlob(id, new Blob([rawBody], { type: mime }));
      const name = String(query.get('name') || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 80) || 'file';
      S.files.push({ id, submission_id: r.id, kind, name, mime, size: rawBody.byteLength, created_at: now() }); save();
      return ok({ file: { id, kind, name, mime, size: rawBody.byteLength } }, 201);
    }
  }
  if ((m = path.match(/^\/api\/files\/([0-9a-f-]{36})\/link$/)) && method === 'POST') {
    const f = S.files.find(x => x.id === m[1]); const r = f && S.subs.find(x => x.id === f.submission_id);
    if (!f || !canSee(user, r)) return fail(404, 'Not found');
    const blob = await getBlob(f.id); if (!blob) return fail(404, 'File missing');
    return ok({ url: URL.createObjectURL(blob) });
  }

  if (path === '/api/patients' && method === 'GET') {
    if (user.role === 'lab') return fail(403, 'Not allowed');
    const code = user.role === 'admin' ? query.get('client_code') : user.client_code; if (!code) return ok([]);
    const words = (query.get('q') || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    return ok(S.patients.filter(p => p.client_code === code && (!words.length || words.every(w => (p.name_key + ' ' + p.phone).includes(w)))).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 20).map(patientOut));
  }
  if (path === '/api/patients/bulk' && method === 'POST') {
    if (user.role === 'lab') return fail(403, 'Not allowed');
    const code = user.role === 'admin' ? String(body.client_code ?? '').toUpperCase() : user.client_code;
    if (!code || !S.clients.some(c => c.code === code && c.active)) return fail(400, 'No active client code');
    const rows = Array.isArray(body.rows) ? body.rows : null; if (!rows) return fail(400, 'No rows');
    if (rows.length > 1000) return fail(400, 'At most 1,000 patients per upload');
    const sexMap = { m: 'Male', male: 'Male', f: 'Female', female: 'Female', t: 'Transgender', transgender: 'Transgender' };
    let added = 0, updated = 0; const rejected = [];
    rows.forEach((r, i) => {
      const line = i + 2, name = String(r.name ?? '').trim(), phone = normPhone(r.phone), sex = sexMap[String(r.sex ?? '').trim().toLowerCase()];
      const dob = String(r.dob ?? '').trim(), age = String(r.age ?? '').trim(), pin = String(r.pin ?? '').trim();
      if (!name) return rejected.push({ row: line, reason: 'Name missing' });
      if (!PHONE_RE.test(phone)) return rejected.push({ row: line, reason: 'Phone must be a 10-digit mobile' });
      if (!sex) return rejected.push({ row: line, reason: 'Sex must be Male, Female or Transgender' });
      if (!dob && !age) return rejected.push({ row: line, reason: 'Date of birth or age needed' });
      if (dob && (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || isNaN(new Date(dob + 'T00:00:00')) || new Date(dob) > new Date())) return rejected.push({ row: line, reason: 'Date of birth must be YYYY-MM-DD and not in the future' });
      if (age && !(Number(age) >= 0 && Number(age) <= 120)) return rejected.push({ row: line, reason: 'Age must be 0-120' });
      if (pin && !/^\d{6}$/.test(pin)) return rejected.push({ row: line, reason: 'Pincode must be 6 digits' });
      const title = ['Mr.', 'Ms.', 'Mrs.', 'Master'].includes(String(r.title ?? '').trim()) ? String(r.title).trim() : null;
      const res = upsertPatient(code, { p_title: title, p_name: name.slice(0, 120), p_phone: phone, p_sex: sex, p_dob: dob || null, p_age: age || null, p_address: String(r.address ?? '').slice(0, 400) || null, p_state: String(r.state ?? '').slice(0, 60) || null, p_pin: pin || null, p_email: String(r.email ?? '').slice(0, 120) || null });
      res === 'added' ? added++ : updated++;
    });
    save(); return ok({ added, updated, rejected: rejected.slice(0, 100), rejected_total: rejected.length });
  }

  if (path.startsWith('/api/admin/')) {
    if (user.role !== 'admin') return fail(403, 'Admin only');
    if (path === '/api/admin/clients' && method === 'GET') return ok(S.clients.map(c => ({ code: c.code, name: c.name, active: c.active, users: S.users.filter(u => u.client_code === c.code).length, submissions: S.subs.filter(s => s.client_code === c.code).length })).sort((a, b) => a.code.localeCompare(b.code)));
    if (path === '/api/admin/clients' && method === 'POST') {
      const c = String(body.code ?? '').trim().toUpperCase();
      if (!/^[A-Z0-9]{3,12}$/.test(c)) return fail(400, 'Client code: 3-12 letters or digits');
      if (!String(body.name ?? '').trim()) return fail(400, 'Name required');
      if (S.clients.some(x => x.code === c)) return fail(409, 'Client code already exists');
      S.clients.push({ code: c, name: String(body.name).trim().slice(0, 120), active: 1, created_at: now() }); save(); return ok({ ok: true }, 201);
    }
    if (path === '/api/admin/users' && method === 'GET') return ok(S.users.map(u => ({ id: u.id, mobile: u.mobile, name: u.name, role: u.role, client_code: u.client_code, active: u.active })));
    if (path === '/api/admin/users' && method === 'POST') {
      const mo = normPhone(body.mobile); if (!PHONE_RE.test(mo)) return fail(400, 'Enter a 10-digit mobile number');
      if (!['client', 'lab', 'admin'].includes(body.role)) return fail(400, 'Role must be client, lab or admin');
      if (!String(body.name ?? '').trim()) return fail(400, 'Name required');
      let cc = null; if (body.role === 'client') { cc = String(body.client_code ?? '').trim().toUpperCase(); if (!S.clients.some(c => c.code === cc)) return fail(400, 'Unknown client code'); }
      if (S.users.some(u => u.mobile === mo)) return fail(409, 'This mobile is already registered');
      S.users.push({ id: S.uid++, mobile: mo, name: String(body.name).trim().slice(0, 120), role: body.role, client_code: cc, active: 1, created_at: now() }); save(); return ok({ ok: true }, 201);
    }
    if ((m = path.match(/^\/api\/admin\/users\/(\d+)\/active$/)) && method === 'POST') {
      const u = S.users.find(x => x.id === Number(m[1])); if (!u) return fail(404, 'Not found');
      if (u.id === user.id) return fail(400, 'You cannot deactivate yourself');
      u.active = body.active ? 1 : 0; if (!u.active) for (const [t, s] of Object.entries(S.sessions)) if (s.uid === u.id) delete S.sessions[t];
      save(); return ok({ ok: true });
    }
  }
  return fail(404, 'Not found');
}

/* ---------- fetch interception ---------- */
S = load(); if (!S || !S.users) seed();
window.fetch = async (input, opts = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (!url.pathname.includes('/api/') || url.origin !== location.origin) return realFetch(input, opts);
  const path = url.pathname.slice(url.pathname.indexOf('/api/'));
  const method = (opts.method || 'GET').toUpperCase();
  const h = opts.headers || {}; const auth = h.Authorization || h.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const ctype = h['Content-Type'] || h['content-type'] || '';
  let body = {}, raw = null;
  if (opts.body instanceof Blob) raw = await opts.body.arrayBuffer();
  else if (opts.body && ctype.includes('json')) { try { body = JSON.parse(opts.body); } catch { return new Response('{"error":"Invalid JSON"}', { status: 400, headers: { 'content-type': 'application/json' } }); } }
  let r;
  try { r = await handle(method, path, url.searchParams, body, token, raw); } catch (e) { console.error(e); r = fail(500, 'Something went wrong'); }
  if (r.text !== undefined) return new Response(r.text, { status: r.status, headers: { 'content-type': 'text/csv' } });
  return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'content-type': 'application/json' } });
};
window.ETRF_SANDBOX = { reset() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } indexedDB.deleteDatabase('etrf_sandbox'); location.hash = '#/login'; location.reload(); }, demo: [['9000000001', 'Demo Centre', 'Sends forms'], ['9000000011', 'Demo Hospital', 'Sends forms, has a patient list'], ['9000000021', 'Demo Clinic', 'Has a rejected form to fix'], ['9000000031', 'Demo Partner Lab', 'Sends forms'], ['9000000002', 'Yello Lab Intake', 'Receives, accepts, rejects'], ['9000000003', 'Yello Admin', 'Clients, users, everything']] };

window.addEventListener('DOMContentLoaded', () => {
  const b = document.createElement('div');
  b.style.cssText = 'background:#201900;color:#fff;font:600 13px Barlow,system-ui,sans-serif;text-align:center;padding:8px 12px;display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap';
  b.innerHTML = '<span><b style="color:#ffc40c">Test mode.</b> Demo data only. Everything stays in this browser.</span>';
  const r = document.createElement('button'); r.textContent = 'Reset test data';
  r.style.cssText = 'font:700 12px Barlow,system-ui,sans-serif;background:#ffc40c;color:#201900;border:0;border-radius:99px;padding:5px 12px;cursor:pointer';
  r.onclick = () => { if (confirm('Delete everything you added in test mode and start again?')) window.ETRF_SANDBOX.reset(); };
  b.appendChild(r); document.body.prepend(b);
});
