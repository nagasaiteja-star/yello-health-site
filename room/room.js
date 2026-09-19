/* Yello Investor Room — viewer. Talks to the Apps Script JSON API via yelloRoomCall(). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var k = new URLSearchParams(location.search).get('k') || '';
  var store = { get: function () { try { return JSON.parse(sessionStorage.getItem('yr:' + k) || 'null'); } catch (e) { return null; } },
                set: function (v) { try { sessionStorage.setItem('yr:' + k, JSON.stringify(v)); } catch (e) {} },
                clear: function () { try { sessionStorage.removeItem('yr:' + k); } catch (e) {} } };
  var S = { s: '', email: '', docs: [], doc: null, page: 1, cache: {}, seen: {} };

  var PROBLEMS = {
    no_link:          ['This page needs a private link.', 'Open the link from your invitation email, or request access below.'],
    link_not_found:   ['This link isn’t recognised.', 'Check you opened the full link from your invitation email, or request access below.'],
    link_revoked:     ['This link has been switched off.', 'Access was withdrawn. Write to us if you think that’s a mistake.'],
    link_expired:     ['This link has expired.', 'Ask us for a fresh link, or request access below.'],
    too_many_attempts:['Too many attempts.', 'This link is locked for an hour after repeated wrong entries. Try again later.'],
    offline:          ['The room isn’t open yet.', 'Online access opens shortly. Email partners@yello.health in the meantime.'],
    server_error:     ['Something went wrong on our side.', 'Reload the page in a minute. If it keeps happening, email partners@yello.health.']
  };
  var FIELD_ERRORS = {
    email_mismatch: 'That email doesn’t match this link. Use the address the invitation was sent to.',
    wrong_passcode: 'That passcode isn’t right. Check the message it came in.',
    nda_required:   'Type your full name and tick the box to continue.',
    network:        'Couldn’t reach the room. Check your connection and try again.'
  };

  function show(name) {
    document.querySelectorAll('.screen').forEach(function (el) { el.hidden = el.getAttribute('data-screen') !== name; });
    document.body.style.background = name === 'view' ? 'var(--night)' : '';
  }
  function problem(code) {
    var p = PROBLEMS[code] || PROBLEMS.server_error;
    $('p-title').textContent = p[0]; $('p-body').textContent = p[1];
    stopClock(); S.doc = null; S.cache = {}; $('v-img').removeAttribute('src'); show('problem');
  }
  function call(payload) {
    return window.yelloRoomCall(payload).catch(function (e) {
      return { ok: false, error: e.message === 'offline' ? 'offline' : 'network' };
    });
  }
  /** Session-level errors route to the right screen; returns true if handled. */
  function handled(r) {
    if (r.ok) return false;
    if (r.error === 'session_expired') { store.clear(); start(); return true; }
    if (r.error === 'nda_required') { show('nda'); return true; }
    if (PROBLEMS[r.error]) { store.clear(); problem(r.error); return true; }
    return false;
  }
  function busy(btn, on, label) { btn.disabled = on; if (label) btn.textContent = label; }

  // ---------- flow ----------
  function start() {
    if (!k) return problem('no_link');
    var saved = store.get();
    if (saved && saved.s) { S.s = saved.s; S.email = saved.email; return loadDocs(); }
    show('loading');
    call({ action: 'open', k: k }).then(function (r) {
      if (!r.ok) return problem(r.error === 'network' ? 'server_error' : r.error);
      $('g-title').textContent = r.investor ? 'Welcome, ' + r.investor.split(' ')[0] + '.' : 'Confirm it’s you.';
      $('g-pass-wrap').hidden = !r.needsPasscode;
      $('n-ver').textContent = r.ndaVersion || '';
      show('gate'); $('g-email').focus();
    });
  }

  $('gateForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = ev.target, msg = f.querySelector('.msg'), btn = f.querySelector('button');
    msg.textContent = '';
    if (!$('g-email').checkValidity() || !$('g-email').value) { $('g-email').reportValidity(); return; }
    busy(btn, true, 'Checking…');
    call({ action: 'verify', k: k, email: $('g-email').value, passcode: $('g-pass').value }).then(function (r) {
      busy(btn, false, 'Continue');
      if (!r.ok) { if (!FIELD_ERRORS[r.error] && handled(r)) return; msg.textContent = FIELD_ERRORS[r.error] || FIELD_ERRORS.network; return; }
      S.s = r.s; S.email = r.email; store.set({ s: r.s, email: r.email });
      if (r.ndaVersion) $('n-ver').textContent = r.ndaVersion;
      if (r.ndaDone) loadDocs(); else { show('nda'); $('n-name').focus(); }
    });
  });

  $('ndaForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = ev.target, msg = f.querySelector('.msg'), btn = f.querySelector('button');
    msg.textContent = '';
    if (!$('n-name').value.trim() || !$('n-agree').checked) { msg.textContent = FIELD_ERRORS.nda_required; return; }
    busy(btn, true, 'Saving…');
    call({ action: 'nda', s: S.s, name: $('n-name').value.trim(), agree: true }).then(function (r) {
      busy(btn, false, 'Agree and enter');
      if (!r.ok) { if (r.error !== 'nda_required' && handled(r)) return; msg.textContent = FIELD_ERRORS[r.error] || FIELD_ERRORS.network; return; }
      loadDocs();
    });
  });

  function loadDocs() {
    show('loading');
    call({ action: 'docs', s: S.s }).then(function (r) {
      if (r.error === 'network') return problem('server_error');
      if (handled(r)) return;
      S.docs = r.docs || [];
      $('who').textContent = r.email || S.email; $('who').hidden = false;
      $('l-title').textContent = r.investor ? 'Welcome, ' + r.investor.split(' ')[0] + '.' : 'Welcome.';
      var ul = $('docs'); ul.innerHTML = '';
      S.docs.forEach(function (d) {
        var li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = '<span class="d-k"></span><span class="d-t"></span><span class="d-m"></span>';
        b.querySelector('.d-k').textContent = d.legal ? 'Draft paper' : 'Document';
        b.querySelector('.d-t').textContent = d.title;
        b.querySelector('.d-m').textContent = d.pages + (d.pages === 1 ? ' page' : ' pages') + (d.legal ? ' · not for signature' : '');
        if (d.legal) b.querySelector('.d-m').classList.add('d-legal');
        b.addEventListener('click', function () { openDoc(d, 1, true); });
        li.appendChild(b); ul.appendChild(li);
      });
      $('l-empty').hidden = S.docs.length > 0;
      var m = /doc=([^&]+)&p=(\d+)/.exec(location.hash);
      var target = m && S.docs.filter(function (d) { return d.doc === decodeURIComponent(m[1]); })[0];
      if (target) openDoc(target, +m[2], false); else show('list');
    });
  }

  // ---------- viewer ----------
  function openDoc(d, p, push) {
    flush();
    S.doc = d; S.seen[d.doc] = S.seen[d.doc] || {};
    $('v-title').textContent = d.title;
    $('v-legal').hidden = !d.legal;
    var dots = $('v-dots'); dots.innerHTML = '';
    for (var i = 1; i <= d.pages && d.pages <= 60; i++) dots.appendChild(document.createElement('i'));
    $('v-mark').innerHTML = '<span></span>';
    var line = S.email + '  ·  ' + new Date().toISOString().slice(0, 10) + '  ·  Confidential';
    $('v-mark').firstChild.textContent = Array(14).join(line + '     ' + line + '\n');
    show('view');
    goto(Math.min(Math.max(1, p || 1), d.pages), push);
  }

  function goto(n, push) {
    if (!S.doc) return;
    flush();
    S.page = n; S.seen[S.doc.doc][n] = 1;
    var h = '#doc=' + encodeURIComponent(S.doc.doc) + '&p=' + n;
    if (push) history.pushState({ doc: S.doc.doc, p: n }, '', h); else history.replaceState({ doc: S.doc.doc, p: n }, '', h);
    $('v-count').textContent = n + ' / ' + S.doc.pages;
    $('v-prev').disabled = n <= 1; $('v-next').disabled = n >= S.doc.pages;
    [].forEach.call($('v-dots').children, function (el, i) { el.className = (i + 1 === n ? 'on' : S.seen[S.doc.doc][i + 1] ? 'seen' : ''); });
    $('v-img').style.visibility = 'hidden'; $('v-loading').hidden = false;
    // A prefetched page is served from memory, so re-check access with the server (revoke bites on the next flip).
    if (S.cache[S.doc.doc + ':' + n]) call({ action: 'beat', s: S.s, doc: S.doc.doc, page: n, secs: 0 }).then(handled);
    fetchPage(S.doc.doc, n).then(function (src) {
      if (!S.doc || S.page !== n) return;
      if (!src) return;
      $('v-img').src = src; $('v-img').alt = S.doc.title + ', page ' + n;
      $('v-img').style.visibility = 'visible'; $('v-loading').hidden = true;
      if (n < S.doc.pages) fetchPage(S.doc.doc, n + 1);
    });
    startClock();
  }

  function fetchPage(doc, n) {
    var key = doc + ':' + n;
    if (!S.cache[key]) {
      S.cache[key] = call({ action: 'page', s: S.s, doc: doc, page: n }).then(function (r) {
        if (!r.ok) { delete S.cache[key]; if (!handled(r)) $('v-loading').textContent = FIELD_ERRORS.network; return null; }
        return 'data:' + r.mime + ';base64,' + r.data;
      });
    }
    return S.cache[key];
  }

  $('v-prev').addEventListener('click', function () { if (S.page > 1) goto(S.page - 1, true); });
  $('v-next').addEventListener('click', function () { if (S.doc && S.page < S.doc.pages) goto(S.page + 1, true); });
  $('v-back').addEventListener('click', function () { flush(); stopClock(); S.doc = null; history.pushState({}, '', location.pathname + location.search); show('list'); });
  document.addEventListener('keydown', function (e) {
    if (!S.doc || $('app').querySelector('[data-screen="view"]').hidden) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); $('v-next').click(); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); $('v-prev').click(); }
  });
  window.addEventListener('popstate', function () {
    var m = /doc=([^&]+)&p=(\d+)/.exec(location.hash);
    var d = m && S.docs.filter(function (x) { return x.doc === decodeURIComponent(m[1]); })[0];
    if (d) { if (!S.doc || S.doc.doc !== d.doc) openDoc(d, +m[2], false); else goto(+m[2], false); }
    else if (S.s) { flush(); stopClock(); S.doc = null; show('list'); }
  });
  // swipe
  var x0 = null;
  $('v-stage').addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  $('v-stage').addEventListener('touchend', function (e) {
    if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) (dx < 0 ? $('v-next') : $('v-prev')).click();
  });
  // no casual copying
  $('v-page').addEventListener('contextmenu', function (e) { e.preventDefault(); });
  $('v-page').addEventListener('dragstart', function (e) { e.preventDefault(); });

  // ---------- time on page ----------
  var acc = 0, last = 0, timer = null, lastInput = Date.now();
  ['mousemove', 'keydown', 'touchstart', 'scroll', 'wheel'].forEach(function (t) { window.addEventListener(t, function () { lastInput = Date.now(); }, { passive: true }); });
  function active() { return document.visibilityState === 'visible' && Date.now() - lastInput < 300000; }  // idle after 5 min without input
  function accrue() { var now = Date.now(); if (active() && last) acc += (now - last) / 1000; last = now; }
  function tick() { accrue(); if (acc >= 10) flush(); }
  function startClock() { last = lastInput = Date.now(); if (!timer) timer = setInterval(tick, 1000); }  // a page turn counts as activity
  function stopClock() { clearInterval(timer); timer = null; last = 0; }
  function flush(beacon) {
    if (timer) accrue();
    if (!S.doc || acc < 1) { acc = 0; return; }
    var body = { action: 'beat', s: S.s, doc: S.doc.doc, page: S.page, secs: Math.min(30, Math.round(acc)) };
    acc = 0;
    if (beacon && navigator.sendBeacon && window.YELLO_ROOM_API) {
      navigator.sendBeacon(window.YELLO_ROOM_API, new Blob([JSON.stringify(body)], { type: 'text/plain' }));
    } else {
      call(body).then(function (r) { handled(r); });
    }
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(true); else if (timer) last = Date.now(); });
  window.addEventListener('pagehide', function () { flush(true); });

  start();
})();
