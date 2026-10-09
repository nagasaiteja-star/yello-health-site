// "Suggest a change" button. Opens a short form and sends it to the team by email (no server needed).
(() => {
  const me = document.currentScript;
  const TO = me?.dataset.to || 'partners@yello.health';
  const AREAS = (me?.dataset.areas || 'Test directory,Forms,e-TRF online forms,Something else').split(',');
  const style = document.createElement('style');
  style.textContent = `
  .fbx-btn{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:60;font:700 14px Barlow,system-ui,sans-serif;background:#201900;color:#fff;border:0;border-radius:99px;padding:12px 18px;min-height:46px;cursor:pointer;box-shadow:0 8px 24px rgba(36,36,36,.28);transition:transform .18s cubic-bezier(.2,.8,.2,1)}
  body:has(.stickybar) .fbx-btn{bottom:calc(92px + env(safe-area-inset-bottom))}
  .fbx-btn:hover{transform:translateY(-2px)}.fbx-btn b{color:#ffc40c}
  .fbx{border:0;border-radius:26px;padding:0;width:min(520px,94vw);max-height:92vh;overflow:auto;font:400 16px/1.5 Barlow,system-ui,sans-serif;color:#242424;box-shadow:0 30px 90px rgba(20,20,20,.3);background:#fff}
  .fbx::backdrop{background:rgba(36,36,36,.38);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
  .fbx form{display:grid;gap:12px;padding:20px 22px 22px}
  .fbx h2{margin:0;font:800 22px Barlow,system-ui,sans-serif;letter-spacing:-.01em}
  .fbx p{margin:0;color:#6a6d73;font-size:14px}
  .fbx label{display:grid;gap:5px;font:700 11px Barlow,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#6a6d73}
  .fbx input,.fbx select,.fbx textarea{font:400 16px Barlow,system-ui,sans-serif;padding:11px 13px;border:1px solid #d3cfc4;border-radius:12px;min-height:46px;width:100%;color:#242424;background:#fff;text-transform:none;letter-spacing:0}
  .fbx textarea{min-height:120px;resize:vertical}
  .fbx .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .fbx .acts{display:flex;gap:8px;flex-wrap:wrap}
  .fbx button{font:700 15px Barlow,system-ui,sans-serif;border-radius:12px;border:1px solid rgba(36,36,36,.12);background:#fff;color:#444;padding:11px 16px;min-height:46px;cursor:pointer}
  .fbx button.p{background:#ffc40c;border-color:#ffc40c;color:#201900;flex:1 1 200px}
  .fbx .err{color:#c24156;font-weight:600;font-size:13px}.fbx .ok{color:#0f766e;font-weight:600;font-size:13px}
  @media (max-width:600px){.fbx{width:100%;max-width:100%;margin:auto 0 0;border-radius:26px 26px 0 0}.fbx .row{grid-template-columns:1fr}}
  @media print{.fbx-btn{display:none}}
  @media (prefers-reduced-motion:reduce){.fbx-btn{transition:none}}`;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.className = 'fbx-btn'; btn.type = 'button'; btn.innerHTML = '<b>+</b> Suggest a change';
  const dlg = document.createElement('dialog'); dlg.className = 'fbx'; dlg.setAttribute('aria-label', 'Suggest a change');
  dlg.innerHTML = `<form method="dialog" id="fbxForm">
    <div><h2>Suggest a change</h2><p>Tell us what to add, fix or remove. It goes to the Yello team by email.</p></div>
    <div class="row"><label>Your name<input name="name" autocomplete="name" required></label>
    <label>Your role<select name="role"><option>Sales</option><option>Admin</option><option>Lab</option><option>Partner / centre</option><option>Management</option><option>Other</option></select></label></div>
    <div class="row"><label>What is it about<select name="area">${AREAS.map(a => `<option>${a.trim()}</option>`).join('')}</select></label>
    <label>How important<select name="prio"><option>Nice to have</option><option>Important</option><option>Blocks my work</option></select></label></div>
    <label>What should change<textarea name="text" required placeholder="Example: show the B2B price next to the MRP in the list, and let me filter by turnaround time."></textarea></label>
    <div id="fbxMsg"></div>
    <div class="acts"><button type="button" id="fbxCancel">Cancel</button><button type="button" id="fbxCopy">Copy text</button><button type="submit" class="p">Email to the team</button></div>
  </form>`;
  const ready = () => { document.body.append(btn, dlg); };
  (document.body ? ready : () => document.addEventListener('DOMContentLoaded', ready))();

  const body = f => {
    const v = Object.fromEntries(new FormData(f));
    return `From: ${v.name} (${v.role})\nAbout: ${v.area}\nImportance: ${v.prio}\n\n${v.text}\n\n---\nPage: ${location.href}\nScreen: ${innerWidth}x${innerHeight}\nBrowser: ${navigator.userAgent.slice(0, 120)}`;
  };
  btn.onclick = () => { dlg.querySelector('#fbxMsg').textContent = ''; dlg.showModal(); };
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  dlg.querySelector('#fbxCancel').onclick = () => dlg.close();
  const form = dlg.querySelector('#fbxForm');
  dlg.querySelector('#fbxCopy').onclick = async () => {
    if (!form.reportValidity()) return;
    const msg = dlg.querySelector('#fbxMsg');
    try { await navigator.clipboard.writeText(body(form)); msg.className = 'ok'; msg.textContent = `Copied. Paste it into an email to ${TO}.`; }
    catch { msg.className = 'err'; msg.textContent = 'Could not copy. Use "Email to the team" instead.'; }
  };
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    const subject = `[Yello ${v.area}] ${v.prio}: ${v.text.slice(0, 60).replace(/\s+/g, ' ')}`;
    location.href = `mailto:${TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body(form))}`;
    const msg = dlg.querySelector('#fbxMsg'); msg.className = 'ok'; msg.textContent = 'Your email app should open with this ready to send. If it does not, tap "Copy text".';
  });
})();
