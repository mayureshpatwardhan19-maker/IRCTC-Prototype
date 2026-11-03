/* IRCTC OneTrip — payment success overlay, Google-Pay style (v1.2). SIMULATED payment.
 * Animated check circle drawing in, "Payment successful", amount in large type, paid to, UPI ref / transaction ID,
 * date-time, booking refs, a subtle ripple + confetti (off under prefers-reduced-motion), Done / View itinerary / Share,
 * and "Your one-page itinerary" (PDF · PNG · WhatsApp · email). Optional tiny chime (WebAudio), off when muted.
 *
 *   OT.paySuccess.show({amount, paidTo, method, txn, at, refs:[{icon, label, ref}], journeyId, viewHref}) -> Promise (resolves on close)
 *   OT.paySuccess.close()
 */
(function () {
  'use strict';
  var OT = window.OT;
  var cur = null;
  function t(k, fb, v) { return OT.t(k, fb, v); }
  function keep(v) { return OT.lang.keep(v); }
  function muted() { return OT.store.get('sound') === 'off'; }
  function reduced() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  /** Two soft notes (~0.35 s, low gain). Never loud, never on page load: only right after the user's own payment click. */
  function chime() {
    if (muted()) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      var ctx = new AC(), now = ctx.currentTime;
      [[880, 0], [1318.5, 0.12]].forEach(function (n) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, now + n[1]); g.gain.exponentialRampToValueAtTime(0.06, now + n[1] + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + n[1] + 0.3);
        o.connect(g); g.connect(ctx.destination); o.start(now + n[1]); o.stop(now + n[1] + 0.32);
      });
      setTimeout(function () { try { ctx.close(); } catch (e) { /* noop */ } }, 800);
    } catch (e) { /* audio unavailable: silent */ }
  }
  function upiRef(txn) { var h = OT.data.rail ? OT.data.rail.hash(txn || 'x') : 1; return String(400000000000 + (h * 7919) % 99999999999).slice(0, 12); }

  function confetti() {
    if (reduced()) return '';
    var cols = ['#12805C', '#F07F1A', '#1C5FD4', '#F5C542', '#6B4FBB'], out = '';
    for (var i = 0; i < 18; i++) {
      out += '<i style="left:' + (8 + (i * 47) % 84) + '%;background:' + cols[i % cols.length] + ';animation-delay:' + ((i % 6) * 0.07).toFixed(2) + 's;--dx:' + (((i * 37) % 60) - 30) + 'px;--rot:' + ((i * 53) % 360) + 'deg"></i>';
    }
    return '<div class="ps-confetti" aria-hidden="true">' + out + '</div>';
  }

  function show(o) {
    o = o || {};
    close(true);
    OT.state.payPending = false;
    var at = o.at ? new Date(o.at) : new Date();
    var refs = o.refs || [];
    var el = OT.h('<div class="ps-overlay" role="dialog" aria-modal="true" aria-labelledby="ps-title" data-tour="pay-success"></div>');
    el.innerHTML = '<div class="ps-card">' + confetti() +
      '<button type="button" class="icon-btn ps-sound" data-ps-sound aria-pressed="' + (!muted()) + '" aria-label="' + OT.esc(muted() ? t('ps2.soundOn', 'Turn success sound on') : t('ps2.soundOff', 'Mute success sound')) + '" title="' + OT.esc(muted() ? t('ps2.soundOn', 'Turn success sound on') : t('ps2.soundOff', 'Mute success sound')) + '">' + OT.icon(muted() ? 'mute' : 'speaker', 18) + '</button>' +
      '<div class="ps-check" aria-hidden="true"><span class="ps-ripple"></span><span class="ps-ripple r2"></span>' +
      '<svg viewBox="0 0 96 96" width="96" height="96"><circle class="ps-circle" cx="48" cy="48" r="44"/><path class="ps-tick" d="M29 49.5 42 62l26-28"/></svg></div>' +
      '<h2 class="ps-title" id="ps-title">' + OT.esc(t('ps2.title', 'Payment successful')) + '</h2>' +
      '<div class="ps-amount"><bdi class="keep">' + OT.esc(OT.inr(o.amount)) + '</bdi></div>' +
      '<p class="ps-to small">' + OT.esc(t('ps2.paidTo', 'Paid to {to}', { to: o.paidTo || 'IRCTC OneTrip' })) + '</p>' +
      '<dl class="ps-meta small">' +
      '<div><dt>' + OT.esc(t('ps2.upi', 'UPI ref. no.')) + '</dt><dd>' + keep(upiRef(o.txn)) + '</dd></div>' +
      '<div><dt>' + OT.esc(t('bk.txn', 'Transaction')) + '</dt><dd>' + keep(o.txn || '—') + '</dd></div>' +
      '<div><dt>' + OT.esc(t('ps2.when', 'Date & time')) + '</dt><dd>' + OT.esc(OT.stamp(at)) + '</dd></div>' +
      '<div><dt>' + OT.esc(t('bk.method', 'Method')) + '</dt><dd>' + OT.esc(o.method || 'UPI (simulated)') + '</dd></div></dl>' +
      (refs.length ? '<ul class="ps-refs">' + refs.map(function (r) {
        return '<li>' + OT.icon(r.icon || 'checkCircle', 15) + '<span class="ps-ref-l">' + OT.esc(r.label) + '</span><bdi class="keep">' + OT.esc(r.ref) + '</bdi></li>';
      }).join('') + '</ul>' : '') +
      '<div class="ps-actions"><button type="button" class="btn btn-ghost" data-ps-share>' + OT.icon('share', 16) + OT.esc(t('ps2.share', 'Share')) + '</button>' +
      '<button type="button" class="btn btn-ghost" data-ps-view>' + OT.icon('route', 16) + OT.esc(t('ps2.view', 'View itinerary')) + '</button>' +
      '<button type="button" class="btn btn-primary" data-ps-done>' + OT.esc(t('ps2.done', 'Done')) + '</button></div>' +
      '<div class="ps-itin" data-tour="itin-snapshot"><p class="ps-itin-h">' + OT.icon('layers', 15) + ' <strong>' + OT.esc(t('it.yours', 'Your one-page itinerary')) + '</strong></p>' +
      '<div class="ps-itin-btns">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-it="pdf">' + OT.icon('printer', 15) + OT.esc(t('it.pdf', 'Download PDF')) + '</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-it="png">' + OT.icon('image', 15) + OT.esc(t('it.png', 'Save PNG')) + '</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-it="wa">' + OT.icon('whatsapp', 15) + OT.esc(t('it.wa', 'WhatsApp')) + '</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-it="mail">' + OT.icon('mail', 15) + OT.esc(t('it.mail', 'Email')) + '</button></div>' + (OT.itinerary ? OT.itinerary.waNoteHTML() : '') + '</div>' +
      '<p class="xs muted ps-sim">' + OT.esc(t('ps2.sim', 'Simulated payment for an academic demo. No money moved.')) + '</p></div>';
    var tr = document.getElementById('toast-root'); if (tr) tr.innerHTML = '';
    document.body.appendChild(el);
    document.body.classList.add('ps-open');
    var resolveFn, done = new Promise(function (r) { resolveFn = r; });
    cur = { el: el, resolve: resolveFn, o: o };
    requestAnimationFrame(function () { el.classList.add('show'); });
    var btn = el.querySelector('[data-ps-done]');
    setTimeout(function () { if (btn && document.body.contains(btn)) btn.focus({ preventScroll: true }); }, 60);
    chime();
    el.querySelector('[data-ps-done]').addEventListener('click', function () { close(); });
    el.querySelector('[data-ps-view]').addEventListener('click', function () { close(); OT.go(o.viewHref || 'journey'); });
    el.querySelector('[data-ps-share]').addEventListener('click', function () { share(o); });
    el.querySelector('[data-ps-sound]').addEventListener('click', function (e) {
      var b = e.currentTarget, off = !muted();
      OT.store.set('sound', off ? 'off' : 'on');
      b.innerHTML = OT.icon(off ? 'mute' : 'speaker', 18); b.setAttribute('aria-pressed', off ? 'false' : 'true');
      b.setAttribute('aria-label', off ? t('ps2.soundOn', 'Turn success sound on') : t('ps2.soundOff', 'Mute success sound'));
      OT.toast(off ? t('ps2.mutedToast', 'Success sound muted.') : t('ps2.unmutedToast', 'Success sound on.'), 'info');
    });
    OT.$$('[data-it]', el).forEach(function (b) {
      b.addEventListener('click', function () { if (OT.itinerary) OT.itinerary.action(b.getAttribute('data-it')); });
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !document.querySelector('.modal-backdrop')) close(); });
    OT.emit('pay:success', o);
    return done;
  }

  function summary(o) {
    var lines = [t('ps2.title', 'Payment successful') + ' · ' + OT.inr(o.amount) + ' · ' + (o.txn || '')];
    (o.refs || []).forEach(function (r) { lines.push(r.label + ': ' + r.ref); });
    lines.push(t('ps2.sim', 'Simulated payment for an academic demo. No money moved.'));
    return lines.join('\n');
  }
  function share(o) {
    var text = summary(o);
    if (navigator.share) {
      navigator.share({ title: 'IRCTC OneTrip', text: text }).catch(function () { /* cancelled */ });
      return;
    }
    var ok = function () { OT.toast(t('ps2.copied', 'Payment summary copied. Paste it anywhere to share.'), 'success'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(ok, function () { fallbackCopy(text); ok(); }); return; }
    } catch (e) { /* fall through */ }
    fallbackCopy(text); ok();
  }
  function fallbackCopy(text) {
    try { var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } catch (e) { /* noop */ }
  }

  function close(silent) {
    if (!cur) return;
    var c = cur; cur = null;
    c.el.classList.remove('show');
    document.body.classList.remove('ps-open');
    setTimeout(function () { c.el.remove(); }, silent ? 0 : 220);
    c.resolve(true);
  }

  OT.paySuccess = { show: show, close: close, isOpen: function () { return !!cur; }, chime: chime, upiRef: upiRef };
})();
