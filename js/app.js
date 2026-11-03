/* IRCTC OneTrip — boot. Runs last. (Builder A) */
(function () {
  'use strict';
  var OT = window.OT;
  if (!OT || !OT.registerView) return;

  OT.registerView('notfound', {
    title: function () { return OT.t('nf.title', 'Page not found'); },
    render: function (el) {
      var name = ((location.hash || '').replace(/^#\/?/, '').split(/[/?]/)[0]) || '';
      el.innerHTML = '<div class="container page"><div class="card empty-state">' + OT.icon('map', 36) +
        '<h1 class="h2">' + OT.esc(OT.t('nf.title', 'Page not found')) + '</h1>' +
        '<p class="muted">' + OT.esc(OT.t('nf.text', 'The page “{name}” does not exist in this prototype, or its module is not loaded.', { name: name })) + '</p>' +
        '<a class="btn btn-primary" href="#/home">' + OT.esc(OT.t('nf.home', 'Back to home')) + '</a></div></div>';
    }
  });

  function boot() {
    try { document.documentElement.lang = OT.i18n.lang(); } catch (e) { /* ignore */ }
    try { OT.shell.init(); } catch (e) { console.error('[OT] shell init failed', e); }
    try { if (OT.assistant) OT.assistant.init(); } catch (e) { console.error('[OT] assistant init failed', e); }
    // v1.2.1: an unpaid auto / e-rickshaw saved by an older version becomes a pay-on-meter ride (never charged)
    try { if (OT.meter) OT.meter.migrate(); } catch (e) { console.error('[OT] meter migrate failed', e); }
    if (!location.hash || location.hash === '#' || location.hash === '#/') {
      try { history.replaceState(null, '', '#/home'); } catch (e) { location.hash = '#/home'; }
    }
    OT.router.render();
    OT.emit('app:ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
