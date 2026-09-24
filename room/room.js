/* Yello Investor Room — viewer. Talks to the Apps Script JSON API via yelloRoomCall(). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var k = new URLSearchParams(location.search).get('k') || '';
  var store = { get: function () { try { return JSON.parse(sessionStorage.getItem('yr:' + k) || 'null'); } catch (e) { return null; } },
                set: function (v) { try { sessionStorage.setItem('yr:' + k, JSON.stringify(v)); } catch (e) {} },
                clear: function () { try { sessionStorage.removeItem('yr:' + k); } catch (e) {} } };
  var S = { s: '', email: '', docs: [], doc: null, page: 1, cache: {}, seen: {}, download: false, feedback: {} };

  var PROBLEMS = {
    no_link:          ['This page needs a private link.', 'Open the link from your invitation email, or request access below.'],
    link_not_found:   ['This link isn’t recognised.', 'Check you opened the full link from your invitation email, or request access below.'],
    link_revoked:     ['This link has been switched off.', 'Access was withdrawn. Write to us if you think that’s a mistake.'],
    link_expired:     ['This link has expired.', 'Ask us for a fresh link, or request access below.'],
    email_blocked:    ['Access isn’t available.', 'This room isn’t open to your address. Write to partners@yello.health if you think that’s a mistake.'],
    too_many_attempts:['Too many attempts.', 'This link is locked for an hour after repeated wrong entries. Try again later.'],
    offline:          ['The room isn’t open yet.', 'Online access opens shortly. Email partners@yello.health in the meantime.'],
    server_error:     ['Something went wrong on our side.', 'Reload the page in a minute. If it keeps happening, email partners@yello.health.']
  };
  var FIELD_ERRORS = {
    email_mismatch:    'That email doesn’t match this link. Use the address the invitation was sent to.',
    email_not_allowed: 'This link is limited to specific addresses. Use your work email, or request access.',
    wrong_passcode:    'That passcode isn’t right. Check the message it came in.',
    nda_required:      'Type your full name and tick the box to continue.',
    empty_question:    'Type your question first.',
    too_many_questions:'You’ve sent a lot of questions this session. Email partners@yello.health for the rest.',
    download_off:      'Downloads aren’t enabled for your link.',
    network:           'Couldn’t reach the room. Check your connection and try again.'
  };

  function show(name) {
    document.querySelectorAll('.screen').forEach(function (el) { el.hidden = el.getAttribute('data-screen') !== name; });
    document.body.style.background = name === 'view' ? 'var(--night)' : '';
  }
  function viewing() { return S.doc && !$('app').querySelector('[data-screen="view"]').hidden; }
  function problem(code) {
    var p = PROBLEMS[code] || PROBLEMS.server_error;
    $('p-title').textContent = p[0]; $('p-body').textContent = p[1];
    stopClock(); S.doc = null; S.cache = {}; $('v-img').removeAttribute('src'); clearFrame(); closeAsk(); show('problem');
  }
  function call(payload) {
    return window.yelloRoomCall(payload).catch(function (e) {
      return { ok: false, error: e.message === 'offline' ? 'offline' : 'network' };
    });
  }
  /** Session-level errors route to the right screen; returns true if handled. */
  function handled(r) {
    if (!r || r.ok) return false;
    if (r.error === 'session_expired') { store.clear(); start(); return true; }
    if (r.error === 'nda_required') { show('nda'); return true; }
    if (PROBLEMS[r.error]) { store.clear(); problem(r.error); return true; }
    return false;
  }
  function busy(btn, on, label) { btn.disabled = on; if (label) btn.textContent = label; }

  // ---------- visit: device + approximate location (disclosed in the confidentiality text) ----------
  function deviceInfo() {
    var ua = navigator.userAgent || '';
    var os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Other';
    var browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? 'Chrome' : /Safari\//.test(ua) && /Version\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Other';
    var device = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'Tablet' : /Mobi|iPhone|Android/.test(ua) ? 'Phone' : 'Desktop';
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    return { device: device, os: os, browser: browser, screen: screen.width + '×' + screen.height, timezone: tz, referrer: document.referrer ? new URL(document.referrer).hostname : '' };
  }
  function withTimeout(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]); }
  function geo() {
    var get = function (u) { return withTimeout(fetch(u, { referrerPolicy: 'no-referrer' }).then(function (r) { if (!r.ok) throw new Error('geo'); return r.json(); }), 3000); };
    return get('https://ipwho.is/').then(function (g) { if (g.success === false) throw new Error('geo'); return { city: g.city, region: g.region, country: g.country }; })
      .catch(function () { return get('https://get.geojs.io/v1/ip/geo.json').then(function (g) { return { city: g.city, region: g.region, country: g.country }; }); })
      .catch(function () { return {}; });
  }
  function recordVisit() {
    var info = deviceInfo();
    geo().then(function (g) {
      info.city = g.city || ''; info.region = g.region || ''; info.country = g.country || '';
      call({ action: 'visit', s: S.s, info: info });
    });
  }

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
      recordVisit();
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
      S.docs = r.docs || []; S.download = !!r.download;
      $('who').textContent = r.email || S.email; $('who').hidden = false;
      $('l-title').textContent = r.investor ? 'Welcome, ' + r.investor.split(' ')[0] + '.' : 'Welcome.';
      renderFolders();
      $('l-empty').hidden = S.docs.length > 0;
      var m = /doc=([^&]+)&p=(\d+)/.exec(location.hash);
      var target = m && S.docs.filter(function (d) { return d.doc === decodeURIComponent(m[1]); })[0];
      if (target) openDoc(target, +m[2], false); else show('list');
    });
  }

  function renderFolders() {
    var box = $('folders'); box.innerHTML = '';
    var order = [], groups = {};
    S.docs.slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); }).forEach(function (d) {
      var f = d.folder || 'Documents';
      if (!groups[f]) { groups[f] = []; order.push(f); }
      groups[f].push(d);
    });
    order.forEach(function (f) {
      var sec = document.createElement('section'); sec.className = 'folder';
      var h = document.createElement('h2'); h.className = 'folder-h'; h.textContent = f;
      var n = document.createElement('span'); n.className = 'folder-n'; n.textContent = groups[f].length + (groups[f].length === 1 ? ' document' : ' documents');
      h.appendChild(n); sec.appendChild(h);
      var ul = document.createElement('ul'); ul.className = 'docs';
      groups[f].forEach(function (d) {
        var li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = '<span class="d-k"></span><span class="d-t"></span><span class="d-m"></span>';
        b.querySelector('.d-k').textContent = (d.draft ? 'Draft preview · ' : '') + (d.legal ? 'Draft paper' : d.type === 'html' ? 'Live deck' : 'Document');
        b.querySelector('.d-t').textContent = d.title;
        var unit = d.type === 'html' ? ' slides' : ' pages';
        b.querySelector('.d-m').textContent = d.pages + (d.pages === 1 ? unit.slice(0, -1) : unit) + (d.legal ? ' · not for signature' : '');
        if (d.legal) b.querySelector('.d-m').classList.add('d-legal');
        if (d.draft) b.classList.add('is-draft');
        b.addEventListener('click', function () { openDoc(d, 1, true); });
        li.appendChild(b); ul.appendChild(li);
      });
      sec.appendChild(ul); box.appendChild(sec);
    });
  }

  // ---------- viewer ----------
  function openDoc(d, p, push) {
    flush();
    S.doc = d; S.seen[d.doc] = S.seen[d.doc] || {};
    $('v-title').textContent = d.title;
    $('v-legal').hidden = !d.legal;
    $('v-dl').hidden = !S.download;
    $('fbForm').hidden = true;
    var dots = $('v-dots'); dots.innerHTML = '';
    for (var i = 1; i <= d.pages && d.pages <= 60; i++) dots.appendChild(document.createElement('i'));
    $('v-mark').innerHTML = '<span></span>';
    $('v-mark').firstChild.textContent = Array(14).join(markLine() + '     ' + markLine() + '\n');
    $('v-page').classList.toggle('is-html', d.type === 'html');
    $('v-img').hidden = d.type === 'html'; $('v-frame').hidden = d.type !== 'html';
    $('v-prev').hidden = $('v-next').hidden = d.type === 'html';
    show('view');
    if (d.type === 'html') openHtml(d, Math.min(Math.max(1, p || 1), d.pages), push);
    else { clearFrame(); goto(Math.min(Math.max(1, p || 1), d.pages), push); }
  }
  function markLine() { return S.email + '  ·  ' + new Date().toISOString().slice(0, 10) + '  ·  Confidential'; }

  /** Common bookkeeping when the visible page/slide changes. */
  function setPage(n, push) {
    flush();
    S.page = n; S.seen[S.doc.doc][n] = 1;
    var h = '#doc=' + encodeURIComponent(S.doc.doc) + '&p=' + n;
    if (push) history.pushState({ doc: S.doc.doc, p: n }, '', h); else history.replaceState({ doc: S.doc.doc, p: n }, '', h);
    $('v-count').textContent = n + ' / ' + S.doc.pages;
    $('v-prev').disabled = n <= 1; $('v-next').disabled = n >= S.doc.pages;
    [].forEach.call($('v-dots').children, function (el, i) { el.className = (i + 1 === n ? 'on' : S.seen[S.doc.doc][i + 1] ? 'seen' : ''); });
    if (n >= S.doc.pages && !S.feedback[S.doc.doc]) showFeedback();
    startClock();
  }

  function goto(n, push) {
    if (!S.doc) return;
    setPage(n, push);
    $('v-img').style.visibility = 'hidden'; $('v-loading').hidden = false; $('v-loading').textContent = 'Loading page…';
    // A prefetched page is served from memory, so re-check access with the server (revoke bites on the next flip).
    if (S.cache[S.doc.doc + ':' + n]) call({ action: 'beat', s: S.s, doc: S.doc.doc, page: n, secs: 0 }).then(handled);
    fetchPage(S.doc.doc, n).then(function (src) {
      if (!S.doc || S.page !== n || S.doc.type === 'html') return;
      if (!src) return;
      $('v-img').src = src; $('v-img').alt = S.doc.title + ', page ' + n;
      $('v-img').style.visibility = 'visible'; $('v-loading').hidden = true;
      if (n < S.doc.pages) fetchPage(S.doc.doc, n + 1);
    });
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

  // ---------- live HTML documents (sandboxed iframe; slides = <section>) ----------
  var TRACKER = '<style>*{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}@media print{body{display:none!important}}</style>' +
    '<script>(function(){var P=function(m){m.yr=1;parent.postMessage(m,"*")};var secs=[].slice.call(document.querySelectorAll("section"));var cur=-1;' +
    'function best(){var b=0,bi=0,h=innerHeight;secs.forEach(function(s,i){var r=s.getBoundingClientRect();var v=Math.max(0,Math.min(r.bottom,h)-Math.max(r.top,0));if(v>b+1){b=v;bi=i}});return bi}' +
    'function upd(){var n=best();if(n!==cur){cur=n;P({t:"slide",n:n+1,of:secs.length})}}var q=0;function sch(){if(!q){q=1;requestAnimationFrame(function(){q=0;upd()})}}' +
    'addEventListener("scroll",sch,{passive:true});addEventListener("resize",sch);addEventListener("load",upd);setTimeout(upd,50);' +
    'var la=0;["mousemove","wheel","keydown","touchstart","scroll","click"].forEach(function(t){addEventListener(t,function(){var n=Date.now();if(n-la>2000){la=n;P({t:"act"})}},{passive:true})});' +
    'function go(n,i){n=Math.max(0,Math.min(secs.length-1,n));if(secs[n])secs[n].scrollIntoView({behavior:i?"instant":"smooth",block:"start"})}' +
    'addEventListener("message",function(e){var m=e.data||{};if(m.yr&&m.t==="goto")go(m.n-1,m.instant)});' +
    'addEventListener("keydown",function(e){if(["ArrowDown","ArrowRight","PageDown"," "].indexOf(e.key)>=0){e.preventDefault();go(cur+1)}else if(["ArrowUp","ArrowLeft","PageUp"].indexOf(e.key)>=0){e.preventDefault();go(cur-1)}' +
    'if(e.key==="PrintScreen"||(e.metaKey&&e.shiftKey)||((e.metaKey||e.ctrlKey)&&(e.key==="p"||e.key==="s")))P({t:"shot",k:e.key})});' +
    '["contextmenu","copy","cut","dragstart","selectstart"].forEach(function(t){addEventListener(t,function(e){e.preventDefault()})});' +
    'addEventListener("blur",function(){P({t:"blur"})});addEventListener("focus",function(){P({t:"focus"})});})();<\/script>';

  function inject(html, extra) {
    var add = TRACKER + (extra || '');
    return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, add + '</body>') : html + add;
  }
  function clearFrame() { var f = $('v-frame'); if (f.getAttribute('data-doc')) { f.removeAttribute('srcdoc'); f.removeAttribute('data-doc'); } }
  var htmlCache = {};
  function fetchHtml(doc) {
    if (!htmlCache[doc]) htmlCache[doc] = call({ action: 'html', s: S.s, doc: doc }).then(function (r) {
      if (!r.ok) { delete htmlCache[doc]; if (!handled(r)) $('v-loading').textContent = FIELD_ERRORS.network; return null; }
      return r.html;
    });
    return htmlCache[doc];
  }
  function openHtml(d, p, push) {
    var f = $('v-frame');
    S.htmlStart = p; S.htmlPush = push;
    setPage(p, push);
    if (f.getAttribute('data-doc') === d.doc) { post({ t: 'goto', n: p }); return; }
    $('v-loading').hidden = false; $('v-loading').textContent = 'Loading document…';
    fetchHtml(d.doc).then(function (html) {
      if (!html || !S.doc || S.doc.doc !== d.doc) return;
      f.setAttribute('data-doc', d.doc);
      f.onload = function () { $('v-loading').hidden = true; if (S.htmlStart > 1) setTimeout(function () { post({ t: 'goto', n: S.htmlStart, instant: true }); }, 80); };
      f.srcdoc = inject(html);
    });
  }
  function post(m) { m.yr = 1; var w = $('v-frame').contentWindow; if (w) w.postMessage(m, '*'); }
  window.addEventListener('message', function (e) {
    var m = e.data || {};
    if (!m.yr || e.source !== $('v-frame').contentWindow || !S.doc || S.doc.type !== 'html') return;
    if (m.t === 'slide') { if (m.n !== S.page && !(S.htmlStart > 1 && m.n === 1 && S.page === S.htmlStart)) setPage(Math.min(m.n, S.doc.pages), false); if (m.n === S.htmlStart) S.htmlStart = 0; }
    else if (m.t === 'act') lastInput = Date.now();
    else if (m.t === 'blur') setTimeout(function () { if (!document.hasFocus()) shield(true); }, 60);
    else if (m.t === 'focus') shield(false);
    else if (m.t === 'shot') flashShield();
  });

  $('v-prev').addEventListener('click', function () { if (S.page > 1) goto(S.page - 1, true); });
  $('v-next').addEventListener('click', function () { if (S.doc && S.page < S.doc.pages) goto(S.page + 1, true); });
  $('v-back').addEventListener('click', function () { flush(); stopClock(); S.doc = null; history.pushState({}, '', location.pathname + location.search); show('list'); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'PrintScreen' || (e.metaKey && e.shiftKey) || ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 's'))) {
      if (viewing()) { flashShield(); if (e.key !== 'PrintScreen') e.preventDefault(); }
      if (e.key === 'PrintScreen' && navigator.clipboard) navigator.clipboard.writeText('').catch(function () {});
    }
    if (!viewing() || !$('askModal').hidden || S.doc.type === 'html' || /INPUT|TEXTAREA/.test((e.target || {}).tagName)) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); $('v-next').click(); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); $('v-prev').click(); }
  });
  window.addEventListener('popstate', function () {
    var m = /doc=([^&]+)&p=(\d+)/.exec(location.hash);
    var d = m && S.docs.filter(function (x) { return x.doc === decodeURIComponent(m[1]); })[0];
    if (d) { if (!S.doc || S.doc.doc !== d.doc) openDoc(d, +m[2], false); else if (d.type === 'html') { post({ t: 'goto', n: +m[2] }); } else goto(+m[2], false); }
    else if (S.s) { flush(); stopClock(); S.doc = null; show('list'); }
  });
  // swipe
  var x0 = null;
  $('v-stage').addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  $('v-stage').addEventListener('touchend', function (e) {
    if (x0 === null || !S.doc || S.doc.type === 'html') return; var dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) (dx < 0 ? $('v-next') : $('v-prev')).click();
  });
  // no casual copying
  $('v-page').addEventListener('contextmenu', function (e) { e.preventDefault(); });
  $('v-page').addEventListener('dragstart', function (e) { e.preventDefault(); });

  // ---------- screenshot protection: blur the page whenever the room isn't the focused window ----------
  var shieldTimer = null;
  function shield(on) { if (!viewing() && on) return; $('v-shield').hidden = !on; $('v-page').classList.toggle('shielded', on); }
  function flashShield() { shield(true); clearTimeout(shieldTimer); shieldTimer = setTimeout(function () { if (document.hasFocus()) shield(false); }, 1500); }
  // hasFocus() stays true while focus is inside the deck iframe, so only a real switch away (another app/window/tab) blurs.
  window.addEventListener('blur', function () { setTimeout(function () { if (!document.hasFocus()) shield(true); }, 60); });
  window.addEventListener('focus', function () { shield(false); });
  $('v-shield').addEventListener('click', function () { shield(false); });

  // ---------- questions ----------
  function openAsk() {
    if (!S.doc) return;
    $('ask-where').textContent = S.doc.title + ' · ' + (S.doc.type === 'html' ? 'slide ' : 'page ') + S.page;
    $('ask-email').textContent = S.email;
    $('askForm').querySelector('.msg').textContent = ''; $('askForm').querySelector('.msg').className = 'msg';
    $('askModal').hidden = false; $('ask-text').focus();
  }
  function closeAsk() { $('askModal').hidden = true; }
  $('v-ask').addEventListener('click', openAsk);
  $('ask-cancel').addEventListener('click', closeAsk);
  $('askModal').addEventListener('click', function (e) { if (e.target === $('askModal')) closeAsk(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('askModal').hidden) closeAsk(); });
  $('askForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var msg = ev.target.querySelector('.msg'), btn = ev.target.querySelector('button[type="submit"]'), t = $('ask-text').value.trim();
    msg.className = 'msg err';
    if (!t) { msg.textContent = FIELD_ERRORS.empty_question; return; }
    busy(btn, true, 'Sending…');
    call({ action: 'ask', s: S.s, doc: S.doc && S.doc.doc, page: S.page, kind: 'question', text: t }).then(function (r) {
      busy(btn, false, 'Send question');
      if (!r.ok) { if (handled(r)) return; msg.textContent = FIELD_ERRORS[r.error] || FIELD_ERRORS.network; return; }
      $('ask-text').value = ''; msg.className = 'msg ok'; msg.textContent = 'Sent. We’ll reply to ' + S.email + '.';
      setTimeout(closeAsk, 1600);
    });
  });

  // ---------- end-of-document feedback ----------
  var fbRating = '';
  function showFeedback() {
    fbRating = ''; $('fb-text').value = ''; $('fbForm').querySelector('.fb-msg').textContent = '';
    [].forEach.call(document.querySelectorAll('.fb-r'), function (b) { b.classList.remove('on'); });
    $('fbForm').hidden = false;
  }
  [].forEach.call(document.querySelectorAll('.fb-r'), function (b) {
    b.addEventListener('click', function () {
      fbRating = b.getAttribute('data-r');
      [].forEach.call(document.querySelectorAll('.fb-r'), function (x) { x.classList.toggle('on', x === b); });
    });
  });
  $('fbForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var m = ev.target.querySelector('.fb-msg');
    if (!fbRating && !$('fb-text').value.trim()) { m.textContent = 'Pick 👍 or 👎, or write a line.'; return; }
    var doc = S.doc; m.textContent = 'Sending…';
    call({ action: 'ask', s: S.s, doc: doc.doc, page: S.page, kind: 'feedback', rating: fbRating, text: $('fb-text').value.trim() }).then(function (r) {
      if (!r.ok) { if (handled(r)) return; m.textContent = FIELD_ERRORS[r.error] || FIELD_ERRORS.network; return; }
      S.feedback[doc.doc] = 1; m.textContent = 'Thank you.';
      setTimeout(function () { $('fbForm').hidden = true; }, 1400);
    });
  });

  // ---------- download (only when the link allows it; watermarked with the viewer's email) ----------
  function loadScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  function save(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function stamp(ctx, w, h) {
    ctx.save(); ctx.globalAlpha = 0.13; ctx.fillStyle = '#242424';
    ctx.font = '700 ' + Math.round(w / 70) + 'px Barlow, Arial, sans-serif';
    ctx.translate(w / 2, h / 2); ctx.rotate(-24 * Math.PI / 180);
    var line = markLine() + '        ' + markLine(), step = Math.round(h / 7);
    for (var y = -h; y <= h; y += step) ctx.fillText(line, -w, y);
    ctx.restore();
  }
  function fileName(ext) { return (S.doc.title + ' — ' + S.email).replace(/[\\/:*?"<>|]+/g, ' ') + '.' + ext; }
  $('v-dl').addEventListener('click', function () {
    if (!S.doc) return;
    var btn = $('v-dl'), doc = S.doc; busy(btn, true, 'Preparing…');
    var done = function (err) { busy(btn, false, 'Download'); if (err) alert(err); };
    call({ action: 'download', s: S.s, doc: doc.doc }).then(function (r) {
      if (!r.ok) { if (handled(r)) return; return done(FIELD_ERRORS[r.error] || FIELD_ERRORS.network); }
      if (doc.type === 'html') {
        return fetchHtml(doc.doc).then(function (html) {
          if (!html) return done(FIELD_ERRORS.network);
          var mark = '<div style="position:fixed;inset:0;pointer-events:none;z-index:2147483647;display:flex;align-items:center;justify-content:center;overflow:hidden;opacity:.13;font:700 15px Barlow,Arial,sans-serif;color:#242424;white-space:pre;line-height:5.2"><span style="transform:rotate(-24deg)">' +
            Array(14).join(markLine() + '     ' + markLine() + '\n').replace(/</g, '&lt;') + '</span></div>' +
            '<div style="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#0a0f1e;color:#fffdf7;font:600 12px Barlow,Arial,sans-serif;padding:6px 12px;text-align:center">Confidential · downloaded by ' + S.email.replace(/</g, '&lt;') + ' on ' + new Date().toISOString().slice(0, 10) + ' · NDIAN Healthcare Private Limited</div>';
          save(new Blob([/<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, mark + '</body>') : html + mark], { type: 'text/html' }), fileName('html'));
          done();
        });
      }
      return loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js').then(function () {
        var pdf = null, n = 0;
        var next = function () {
          n++;
          if (n > doc.pages) { save(pdf.output('blob'), fileName('pdf')); return done(); }
          btn.textContent = 'Preparing ' + n + '/' + doc.pages + '…';
          return fetchPage(doc.doc, n).then(function (src) {
            if (!src) throw new Error('page');
            return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src; });
          }).then(function (im) {
            var w = im.naturalWidth || 1600, h = im.naturalHeight || 900, c = document.createElement('canvas');
            c.width = w; c.height = h; var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(im, 0, 0, w, h); stamp(ctx, w, h);
            var o = w >= h ? 'landscape' : 'portrait';
            if (!pdf) pdf = new window.jspdf.jsPDF({ orientation: o, unit: 'px', format: [w, h], compress: true }); else pdf.addPage([w, h], o);
            pdf.addImage(c.toDataURL('image/jpeg', 0.86), 'JPEG', 0, 0, w, h);
            return next();
          });
        };
        return next();
      }).catch(function () { done('The download couldn’t be prepared. Try again, or email partners@yello.health.'); });
    });
  });

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
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { flush(true); shield(true); } else if (timer) last = Date.now(); });
  window.addEventListener('pagehide', function () { flush(true); });

  start();
})();
