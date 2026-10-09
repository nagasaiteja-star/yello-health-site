// Shared by server (authoritative) and browser (instant feedback).
// A field is { id, label, type, required, options, showIf, hint, max }.
// showIf: { id, eq } | { id, in: [...] } | { id, has } (for checks) | { id, notEmpty: true }

export const PHONE_RE = /^[6-9]\d{9}$/;
export const PIN_RE = /^\d{6}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normPhone(v) {
  const s = String(v ?? '').replace(/[\s\-()]/g, '').replace(/^(\+?91|0)(?=\d{10}$)/, '');
  return s;
}

export function isVisible(field, data) {
  const c = field.showIf;
  if (!c) return true;
  const v = data[c.id];
  if ('eq' in c) return v === c.eq;
  if ('in' in c) return c.in.includes(v);
  if ('has' in c) return Array.isArray(v) && v.includes(c.has);
  if (c.notEmpty) return Array.isArray(v) ? v.length > 0 : !!String(v ?? '').trim();
  return true;
}

export function allFields(form) {
  return form.sections.flatMap(s => s.fields);
}

function empty(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
}

export function validate(form, data, now = new Date()) {
  const errors = {};
  for (const f of allFields(form)) {
    if (f.type === 'note') continue;
    if (!isVisible(f, data)) continue;
    const v = data[f.id];
    if (f.required && empty(v)) { errors[f.id] = 'Required'; continue; }
    if (empty(v)) continue;
    switch (f.type) {
      case 'tel':
        if (!PHONE_RE.test(normPhone(v))) errors[f.id] = 'Enter a 10-digit mobile number';
        break;
      case 'pincode':
        if (!PIN_RE.test(String(v).trim())) errors[f.id] = 'Enter a 6-digit pincode';
        break;
      case 'email':
        if (!EMAIL_RE.test(String(v).trim())) errors[f.id] = 'Enter a valid email';
        break;
      case 'number': {
        const n = Number(v);
        if (!Number.isFinite(n) || n < (f.min ?? 0) || n > (f.max ?? 1e6)) errors[f.id] = `Enter a number from ${f.min ?? 0} to ${f.max ?? 1e6}`;
        break;
      }
      case 'date': {
        const d = new Date(v + 'T00:00:00');
        if (isNaN(d)) errors[f.id] = 'Enter a valid date';
        else if (f.noFuture && d > now) errors[f.id] = 'Date cannot be in the future';
        else if (f.noPast && d < new Date(now.toDateString())) errors[f.id] = 'Date cannot be in the past';
        break;
      }
      case 'datetime': {
        const d = new Date(v);
        if (isNaN(d)) errors[f.id] = 'Enter a valid date and time';
        else if (f.noFuture && d.getTime() > now.getTime() + 5 * 60000) errors[f.id] = 'Time cannot be in the future';
        break;
      }
      case 'select':
      case 'radio':
        if (f.options && !f.options.includes(v)) errors[f.id] = 'Choose one of the options';
        break;
      case 'checks':
        if (!Array.isArray(v) || (f.options && v.some(x => !f.options.includes(x)))) errors[f.id] = 'Invalid selection';
        break;
      case 'tests':
        if (!Array.isArray(v) || v.some(t => !t || typeof t.code !== 'string' || typeof t.name !== 'string')) errors[f.id] = 'Invalid test list';
        break;
      case 'bool':
        if (f.required && v !== true) errors[f.id] = 'Please confirm';
        break;
      default:
        if (typeof v !== 'string') errors[f.id] = 'Invalid value';
        else if (v.length > (f.maxLen ?? 2000)) errors[f.id] = 'Too long';
    }
  }
  // Cross-field rules
  for (const r of form.rules ?? []) {
    if (errors[r.errorOn]) continue;
    if (r.type === 'oneOf') {
      const ok = r.ids.some(id => !empty(data[id]));
      if (!ok) errors[r.errorOn] = r.message;
    } else if (r.type === 'anyChecked') {
      const ok = r.ids.some(id => !empty(data[id]));
      if (!ok) errors[r.errorOn] = r.message;
    }
  }
  return errors;
}

// Keep only known, visible fields so stale hidden answers never get stored.
export function clean(form, data) {
  const out = {};
  for (const f of allFields(form)) {
    if (f.type === 'note') continue;
    if (!isVisible(f, data)) continue;
    const v = data[f.id];
    if (empty(v)) continue;
    out[f.id] = typeof v === 'string' ? v.trim() : v;
    if (f.type === 'tel') out[f.id] = normPhone(v);
  }
  return out;
}
