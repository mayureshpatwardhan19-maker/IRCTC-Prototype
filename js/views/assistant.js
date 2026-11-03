/* IRCTC OneTrip — multilingual assistant drawer (Customer Support Agent). Mic + speaker per message,
 * language switching mid-conversation, quick replies, original text for critical info, human escalation,
 * AI mode indicator. (Builder A)
 */
(function () {
  'use strict';
  var OT = window.OT;
  var A = OT.assistant = {};
  var el = null, msgs = [], isOpen = false, rec = null, greeted = false, busy = false;
  function t(k, fb, v) { return OT.t(k, fb, v); }
  function L() { return OT.i18n.lang(); }

  var SAMPLE_Q = { hi: 'मेरा रिफंड कब आएगा?', ta: 'என் பணம் எப்போது திரும்ப வரும்?', bn: 'আমার রিফান্ড কবে আসবে?', en: 'When will my refund arrive?' };
  var CHIPS = [
    ['status', 'asst.c.status', 'Booking status'], ['refund', 'asst.c.refund', 'Refund status'], ['cancel', 'asst.c.cancel', 'Cancel a booking'],
    ['pnr', 'asst.c.pnr', 'My PNR'], ['checkin', 'asst.c.checkin', 'Early check-in'], ['human', 'asst.c.human', 'Talk to a human']
  ];

  function modeHTML() {
    var live = OT.gemini && OT.gemini.available();
    return '<span class="badge ' + (live ? 'b-ok' : 'b-sim') + '" title="' + OT.esc(live ? t('asst.mode.liveT', 'Free-form questions use Gemini, grounded on your booking data') : t('asst.mode.simT', 'Rule-based agents over sample data. Add a Gemini key in Settings for free-form answers.')) + '">' +
      OT.icon(live ? 'spark' : 'flag', 12) + '<span>' + OT.esc(live ? t('asst.mode.live', 'Gemini live') : t('asst.mode.sim', 'Simulated agents')) + '</span></span>';
  }

  function shellHTML() {
    return '<div class="asst-backdrop" data-asst-close></div>' +
      '<div class="asst-drawer" role="dialog" aria-modal="false" aria-labelledby="asst-title">' +
      '<header class="asst-head"><span class="asst-av">' + OT.icon('headset', 20) + '</span>' +
      '<div class="asst-hd"><strong id="asst-title">' + OT.esc(t('asst.title', 'OneTrip Assistant')) + '</strong>' +
      '<span class="xs muted">' + OT.esc(t('asst.sub', 'Customer Support Agent · speaks your language')) + '</span><span class="asst-mode">' + modeHTML() + '</span></div>' +
      '<label class="asst-lang"><span class="sr-only">' + OT.esc(t('hdr.lang', 'Select language')) + '</span>' + OT.icon('globe', 14) +
      '<select id="asst-lang">' + OT.i18n.languages.map(function (l) { return '<option value="' + l.code + '"' + (l.code === L() ? ' selected' : '') + '>' + OT.esc(l.native) + '</option>'; }).join('') + '</select></label>' +
      '<button type="button" class="icon-btn" data-asst-close aria-label="' + OT.esc(t('common.close', 'Close')) + '">' + OT.icon('x', 18) + '</button></header>' +
      '<div class="asst-msgs" id="asst-msgs" aria-live="polite"></div>' +
      '<div class="asst-chips" id="asst-chips"></div>' +
      '<form class="asst-input" id="asst-form">' +
      '<button type="button" class="icon-btn" id="asst-mic" aria-label="' + OT.esc(t('search.voice', 'Speak your query')) + '">' + OT.icon('mic', 18) + '</button>' +
      '<input id="asst-in" class="input" autocomplete="off" placeholder="' + OT.esc(t('asst.ph', 'Ask about booking, refund, PNR…')) + '">' +
      '<button type="submit" class="icon-btn send" aria-label="' + OT.esc(t('asst.send', 'Send')) + '">' + OT.icon('send', 18) + '</button></form>' +
      '<div class="asst-translit hidden" id="asst-translit"></div>' +
      '<p class="asst-foot xs muted">' + OT.esc(t('asst.foot', 'Simulated support on sample data. Critical information shows the original text. You can ask for a human anytime.')) + '</p>' +
      '</div>';
  }

  function msgHTML(m, i) {
    if (m.role === 'sys') return '<div class="msg msg-sys xs">' + OT.icon('info', 12) + ' ' + OT.esc(m.text) + '</div>';
    if (m.role === 'user') {
      return '<div class="msg msg-user" lang="' + OT.esc(m.lang) + '"><div class="bubble">' + OT.lang.highlight(m.text) + '</div>' +
        '<div class="msg-meta xs">' + OT.esc(OT.lang.info(m.det.code).native) + ' · ' + Math.round(m.det.confidence * 100) + '%' + (m.voice ? ' · ' + OT.esc(t('asst.viaVoice', 'voice')) : '') + '</div></div>';
    }
    var r = m.res || {};
    var showOrig = m.lang !== 'en' && r.textEn && r.textEn !== r.text;
    var body = showOrig ? OT.lang.translatedBlock({ text: r.text, original: r.textEn, origLang: 'en', lang: m.lang, engine: r.engine === 'gemini' ? 'gemini' : r.fellBack ? 'unavailable' : 'template', confidence: r.confidence })
      : '<div class="tb-main" lang="' + OT.esc(m.lang) + '">' + OT.lang.highlight(r.text) + '</div>';
    return '<div class="msg msg-bot" data-i="' + i + '"><span class="msg-av">' + OT.icon('bot', 15) + '</span><div class="bubble">' + body +
      (r.fellBack ? '<p class="xs tb-warn">' + OT.icon('info', 12) + ' ' + OT.esc(t('asst.fellBack', 'This reply is in English: no reviewed template for {lang} yet. A human agent can reply in {lang}.', { lang: OT.lang.info(m.lang).native })) + '</p>' : '') +
      (r.citations && r.citations.length ? '<div class="cites xs">' + OT.icon('layers', 12) + ' ' + OT.esc(t('asst.grounded', 'Grounded on')) + ': ' + r.citations.map(function (c) { return '<span class="cite">' + OT.esc(c.title) + '</span>'; }).join(' ') + '</div>' : '') +
      (r.ticket ? '<div class="ticket-chip small">' + OT.icon('headset', 14) + ' ' + OT.esc(t('asst.ticket', 'Ticket')) + ' <bdi class="keep">' + OT.esc(r.ticket.id) + '</bdi> · ' + OT.badge('pending', t('bk.open', 'Open · human agent')) + '</div>' : '') +
      '<div class="msg-tools">' +
      '<button type="button" class="btn-link xs" data-speak="' + i + '">' + OT.icon('speaker', 13) + ' ' + OT.esc(t('res.listen', 'Listen')) + '</button>' +
      (r.actions || []).map(function (a, k) { return '<button type="button" class="btn btn-ghost btn-sm" data-act="' + i + ':' + k + '">' + OT.esc(a.label) + '</button>'; }).join('') +
      '<span class="xs muted">' + OT.esc(r.engine === 'gemini' ? 'Gemini' : t('asst.rules', 'Support Agent (rules)')) + ' · ' + Math.round((r.confidence || 0) * 100) + '%</span>' +
      '</div></div></div>';
  }

  function renderMsgs() {
    var box = el && el.querySelector('#asst-msgs'); if (!box) return;
    box.innerHTML = msgs.map(msgHTML).join('') + (busy ? '<div class="msg msg-bot"><span class="msg-av">' + OT.icon('bot', 15) + '</span><div class="bubble typing"><i></i><i></i><i></i></div></div>' : '');
    box.scrollTop = box.scrollHeight;
  }
  function renderChips() {
    var c = el && el.querySelector('#asst-chips'); if (!c) return;
    c.innerHTML = CHIPS.map(function (ch) { return '<button type="button" class="chip" data-chip="' + ch[0] + '">' + OT.esc(t(ch[1], ch[2])) + '</button>'; }).join('');
  }

  function greet() {
    if (greeted) return;
    greeted = true;
    msgs.push({ role: 'bot', lang: L(), res: { text: t('asst.hello', 'Namaste! I can help with your booking status, cancellations, refunds and PNR, in your language. Type, tap the mic, or pick a question below.'), confidence: 1, engine: 'template',
      textEn: OT.i18n.tIn('en', 'asst.hello', 'Namaste! I can help with your booking status, cancellations, refunds and PNR, in your language. Type, tap the mic, or pick a question below.') } });
  }

  A.ask = function (text, opts) {
    opts = opts || {};
    text = String(text || '').trim();
    if (!text || busy) return Promise.resolve(null);
    var lang = L();
    var det = OT.lang.detect(text);
    msgs.push({ role: 'user', text: text, lang: det.code, det: det, voice: !!opts.voice });
    busy = true; renderMsgs();
    // If the traveller writes in another language than the UI, answer in the language they used.
    var replyLang = det.confidence >= 0.7 && det.code !== lang && det.script !== 'Latn' ? det.code : lang;
    var cmd = !opts.intent && OT.agents.parseCommand ? OT.agents.parseCommand(text) : null;
    if (cmd && cmd.intent === 'train' && cmd.to) {
      return OT.sleep(350).then(function () {
        busy = false;
        var date = cmd.date || OT.trains.tomorrow(), sn = function (c) { return OT.data.travel.stationName(c, replyLang); };
        var res = cmd.from ? { text: OT.i18n.tIn(replyLang, 'asst.trainReply', 'I can search trains {from} → {to} on {date}. Tap below to see timings, fares and seats (simulated).', { from: sn(cmd.from), to: sn(cmd.to), date: OT.fmtDate(date) }),
          confidence: 0.9, engine: 'rules', actions: [{ label: OT.i18n.tIn(replyLang, 'trn.search', 'Search trains'), route: OT.trains.path({ from: cmd.from, to: cmd.to, date: date, cls: cmd.cls || '', pax: cmd.pax || '', heard: text, trip: cmd.round ? 'round' : '', ret: cmd.round ? (cmd.ret || OT.data.travel.addDays(date, 2)) : '' }) }] }
          : { text: OT.i18n.tIn(replyLang, 'asst.trainFrom', 'Train to {to}: from which station are you travelling?', { to: sn(cmd.to) }), confidence: 0.7, engine: 'rules', actions: [] };
        var m = { role: 'bot', lang: replyLang, res: res };
        msgs.push(m); renderMsgs();
        if (opts.speak) OT.lang.speak(res.text, replyLang);
        return m;
      });
    }
    return OT.sleep(450).then(function () {
      return OT.agents.support(text, { lang: replyLang, intent: opts.intent });
    }).then(function (res) {
      busy = false;
      var m = { role: 'bot', lang: replyLang, res: res };
      msgs.push(m);
      if (replyLang !== lang) msgs.push({ role: 'sys', text: t('asst.replyIn', 'Replied in {lang} because you wrote in it.', { lang: OT.lang.info(replyLang).native }) });
      renderMsgs();
      if (opts.speak) OT.lang.speak(res.text, replyLang);
      OT.emit('assistant:reply', m);
      return m;
    }).catch(function (e) {
      busy = false; console.error(e);
      msgs.push({ role: 'sys', text: t('asst.err', 'Something went wrong. Please try again or ask for a human.') });
      renderMsgs(); return null;
    });
  };

  function micStart() {
    var b = el.querySelector('#asst-mic'), inp = el.querySelector('#asst-in');
    if (rec) { rec.stop(); rec = null; b.classList.remove('listening'); return; }
    var lang = L();
    b.classList.add('listening');
    rec = OT.lang.listen({
      lang: lang,
      onInterim: function (s) { inp.value = s; },
      onResult: function (s) { inp.value = ''; A.ask(s, { voice: true, speak: true }); },
      onError: function (e) {
        var sq = SAMPLE_Q[lang] || t('asst.c.refund', 'Refund status');
        msgs.push({ role: 'sys', text: e.message });
        msgs.push({ role: 'bot', lang: lang, res: { text: t('asst.trySample', 'You can try a sample spoken question instead:'), confidence: 1, engine: 'template', actions: [{ label: '▶ ' + sq, sample: sq }] } });
        renderMsgs();
      },
      onEnd: function () { rec = null; b.classList.remove('listening'); }
    });
    if (!rec) b.classList.remove('listening');
  }

  function translitHint() {
    var inp = el.querySelector('#asst-in'), box = el.querySelector('#asst-translit');
    var v = inp.value, lang = L();
    var dv = OT.lang.detect(v), target = dv.romanised ? 'hi' : (dv.code === 'en' ? null : lang);
    var r = target && /[A-Za-z]{3,}/.test(v) ? OT.lang.transliterate(v, target) : null;
    if (r && r.changed) {
      box.classList.remove('hidden');
      box.innerHTML = OT.icon('edit', 12) + ' <button type="button" class="btn-link small" lang="' + target + '" data-tl>' + OT.esc(r.text) + '</button>';
      box.querySelector('[data-tl]').addEventListener('click', function () { inp.value = r.text; box.classList.add('hidden'); inp.focus(); });
    } else { box.classList.add('hidden'); box.innerHTML = ''; }
  }

  function bind() {
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-asst-close]')) { A.close(); return; }
      var chip = e.target.closest('[data-chip]');
      if (chip) { A.ask(chip.textContent, { intent: chip.getAttribute('data-chip') }); return; }
      var sp = e.target.closest('[data-speak]');
      if (sp) { var m = msgs[+sp.getAttribute('data-speak')]; if (m && m.res) OT.lang.speak(m.res.text, m.lang); return; }
      var act = e.target.closest('[data-act]');
      if (act) {
        var p = act.getAttribute('data-act').split(':'), mm = msgs[+p[0]], a = mm && mm.res.actions[+p[1]];
        if (!a) return;
        if (a.route) { A.close(); OT.go(a.route); }
        else if (a.escalate) A.ask(t('asst.c.human', 'Talk to a human'), { intent: 'human' });
        else if (a.sample) A.ask(a.sample, { voice: true, speak: true });
      }
    });
    el.querySelector('#asst-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var inp = el.querySelector('#asst-in'); var v = inp.value; inp.value = '';
      el.querySelector('#asst-translit').classList.add('hidden');
      A.ask(v);
    });
    el.querySelector('#asst-in').addEventListener('input', OT.debounce(translitHint, 250));
    el.querySelector('#asst-mic').addEventListener('click', micStart);
    el.querySelector('#asst-lang').addEventListener('change', function (e) { OT.i18n.setLang(e.target.value); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen && !document.querySelector('.modal-backdrop')) A.close(); });
  }

  function build() {
    el = document.getElementById('assistant-root');
    if (!el) return;
    el.innerHTML = shellHTML();
    el.classList.toggle('open', isOpen);
    renderMsgs(); renderChips();
  }

  A.init = function () {
    build();
    if (!el) return;
    bind();
    OT.on('lang', function (code) {
      var keepIn = el.querySelector('#asst-in') ? el.querySelector('#asst-in').value : '';
      el.innerHTML = shellHTML();
      el.classList.toggle('open', isOpen);
      if (greeted) msgs.push({ role: 'sys', text: t('asst.switched', 'Language changed to {lang}. The conversation continues.', { lang: OT.lang.info(code).native }) });
      renderMsgs(); renderChips();
      el.querySelector('#asst-in').value = keepIn;
      // re-bind inner form controls (container listener persists)
      el.querySelector('#asst-form').addEventListener('submit', function (e) { e.preventDefault(); var inp = el.querySelector('#asst-in'); var v = inp.value; inp.value = ''; A.ask(v); });
      el.querySelector('#asst-in').addEventListener('input', OT.debounce(translitHint, 250));
      el.querySelector('#asst-mic').addEventListener('click', micStart);
      el.querySelector('#asst-lang').addEventListener('change', function (e) { OT.i18n.setLang(e.target.value); });
    });
    var upd = function () { var m = el.querySelector('.asst-mode'); if (m) m.innerHTML = modeHTML(); };
    OT.on('store:geminiKey', upd); OT.on('store:aiMode', upd); OT.on('gemini:status', upd);
  };
  A.open = function () {
    if (!el) return;
    greet(); isOpen = true; el.classList.add('open'); renderMsgs();
    var b = document.getElementById('hdr-assistant'); if (b) b.classList.add('active');
    setTimeout(function () { var i = el.querySelector('#asst-in'); if (i && window.innerWidth > 640) i.focus(); }, 200);
  };
  A.close = function () {
    if (!el) return;
    isOpen = false; el.classList.remove('open');
    if (rec) { rec.stop(); rec = null; }
    var b = document.getElementById('hdr-assistant'); if (b) b.classList.remove('active');
  };
  A.toggle = function () { if (isOpen) A.close(); else A.open(); };
  A.isOpen = function () { return isOpen; };
  A.reset = function () { msgs = []; greeted = false; renderMsgs(); };
})();
