/* IRCTC OneTrip — simulated login / registration with a role picker. No real authentication,
 * no password is stored. (Builder A)
 */
(function () {
  'use strict';
  var OT = window.OT;
  function t(k, fb, v) { return OT.t(k, fb, v); }

  var ROLES = {
    traveller: { icon: 'user', key: 'auth.traveller', en: 'Traveller', dkey: 'auth.travellerD', den: 'Plan and manage your journey',
      demo: { name: 'Sunita Sharma', email: 'sunita.sharma@demo.onetrip', phone: '+91 75898 02655' }, home: 'journey' },
    partner: { icon: 'store', key: 'auth.partner', en: 'Tourism Partner', dkey: 'auth.partnerD', den: 'Hotel Shivalik View (P-101)',
      demo: { name: 'Rajinder Singh', email: 'p101.shivalik@demo.onetrip', phone: '+91 75898 02655', partnerId: 'P-101', org: 'Hotel Shivalik View' }, home: 'partner' },
    admin: { icon: 'bank', key: 'auth.admin', en: 'Admin & Bank', dkey: 'auth.adminD', den: 'IRCTC operations · Partner Bank (sample)',
      demo: { name: 'Ananya Rao', email: 'admin@demo.onetrip', phone: '+91 75898 02655', org: 'IRCTC OneTrip Admin · Partner Bank (sample)' }, home: 'admin' }
  };
  var role = 'traveller';

  function goHome(r) {
    var dest = ROLES[r].home;
    if (dest === 'journey') dest = 'home';
    if ((dest === 'partner' || dest === 'admin') && !(OT.views && OT.views[dest])) {
      OT.toast(t('auth.noDash', 'That dashboard is not loaded in this build.'), 'error');
      dest = 'home';
    }
    OT.go(dest);
  }

  function signIn(r, extra) {
    var d = ROLES[r].demo;
    if (!extra || !extra.name) { var pid = r === 'traveller' ? 'sunita' : r; if (OT.data.personas && OT.data.personas.get(pid)) { extra = Object.assign({}, extra); delete extra.email; return signInPersona(pid, { keepLang: !!(extra && extra.lang) }); } }
    var u = Object.assign({ name: d.name, email: d.email, phone: d.phone, role: r }, d.partnerId ? { partnerId: d.partnerId } : {}, d.org ? { org: d.org } : {}, extra || {}, { signedInAt: new Date().toISOString(), simulated: true });
    OT.store.set('user', u);
    OT.toast(t('auth.welcome', 'Signed in as {name} ({role}) · simulated', { name: u.name, role: t(ROLES[r].key, ROLES[r].en) }), 'success');
    goHome(r);
  }

  function rolePicker() {
    return '<fieldset class="roles"><legend class="label">' + OT.esc(t('auth.as', 'Sign in as')) + '</legend>' +
      Object.keys(ROLES).map(function (k) {
        var r = ROLES[k];
        return '<label class="role-card' + (k === role ? ' on' : '') + '"><input type="radio" name="role" value="' + k + '"' + (k === role ? ' checked' : '') + '>' +
          OT.icon(r.icon, 22) + '<span><strong>' + OT.esc(t(r.key, r.en)) + '</strong><span class="xs muted">' + OT.esc(t(r.dkey, r.den)) + '</span></span></label>';
      }).join('') + '</fieldset>';
  }

  function signedInHTML(u) {
    return '<div class="card signed"><div class="row">' + OT.icon('checkCircle', 26) + '<div><strong>' + OT.esc(t('auth.signedAs', 'Signed in as {name}', { name: u.name })) + '</strong>' +
      '<div class="small muted">' + OT.esc(u.email) + ' · ' + OT.esc(t((ROLES[u.role] || ROLES.traveller).key, (ROLES[u.role] || ROLES.traveller).en)) + (u.partnerId ? ' · ' + OT.esc(u.partnerId) : '') + '</div></div></div>' +
      '<div class="row-wrap mt12"><button type="button" class="btn btn-primary btn-sm" id="auth-continue">' + OT.esc(t('auth.continue', 'Continue')) + '</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="auth-logout">' + OT.icon('logout', 15) + OT.esc(t('auth.logout', 'Sign out')) + '</button></div></div>';
  }

  /* ---------------- v1.1 personas ---------------- */
  function personaCard(p, u) {
    var on = u && u.personaId === p.id;
    var L = OT.i18n.lang(), lang = OT.lang.info(p.lang);
    var home = p.homeCity ? OT.data.travel.stationName(p.homeCity, L) : (p.partnerId ? 'Chandigarh' : 'New Delhi');
    return '<article class="login-persona' + (on ? ' on' : '') + '" data-persona-card="' + p.id + '">' +
      '<div class="ps-top"><span class="avatar-ini big">' + OT.esc(p.name.split(' ').map(function (w) { return w.charAt(0); }).join('').slice(0, 2)) + '</span>' +
      '<div><strong>' + OT.esc(p.name) + '</strong><span class="xs muted">' + OT.esc(t(p.segKey, p.seg)) + '</span></div></div>' +
      '<dl class="ps-meta xs"><div><dt>' + OT.esc(t('um.home', 'Home city')) + '</dt><dd>' + OT.esc(home) + (p.homeCity && home.indexOf(p.homeCity) < 0 ? ' <bdi class="keep">' + p.homeCity + '</bdi>' : '') + '</dd></div>' +
      '<div><dt>' + OT.esc(t('auth.prefLang', 'Preferred language')) + '</dt><dd lang="' + p.lang + '">' + OT.esc(lang.native) + '</dd></div>' +
      (p.trips ? '<div><dt>' + OT.esc(t('ps.trips', 'Typical trips')) + '</dt><dd>' + OT.esc(p.trips) + '</dd></div>' : '') +
      (p.party ? '<div><dt>' + OT.esc(t('ps.party', 'Travels with')) + '</dt><dd>' + OT.esc(t('ps.partyN', '{n} traveller(s)', { n: p.party.length })) + '</dd></div>' : '') + '</dl>' +
      '<button type="button" class="btn ' + (on ? 'btn-ghost' : 'btn-primary') + ' btn-sm btn-block" data-signin-persona="' + p.id + '">' + OT.icon(on ? 'check' : 'user', 15) +
      OT.esc(on ? t('ps.current', 'Signed in') : t('ps.signin', 'Sign in as {name}', { name: p.short })) + '</button></article>';
  }
  function signInPersona(id, opts) {
    opts = opts || {};
    var p = OT.data.personas.get(id); if (!p) return;
    var prev = OT.i18n.lang();
    var u = { name: p.name, email: p.email, phone: p.phone, role: p.role, personaId: p.id, lang: p.lang, signedInAt: new Date().toISOString(), simulated: true };
    if (p.homeCity) u.homeCity = p.homeCity;
    if (p.prefs) u.prefs = JSON.parse(JSON.stringify(p.prefs));
    if (p.party) u.party = JSON.parse(JSON.stringify(p.party));
    if (p.budget) u.budget = p.budget;
    if (p.consents) u.consents = JSON.parse(JSON.stringify(p.consents));
    if (p.partnerId) u.partnerId = p.partnerId;
    if (p.org) u.org = p.org;
    OT.store.set('user', u);
    OT.state.stay = null; OT.state.fyLw = 0; OT.state.homeDraft = '';
    var switched = p.lang && p.lang !== prev && !opts.keepLang;
    if (switched) OT.i18n.setLang(p.lang);
    OT.toast(t('auth.welcome', 'Signed in as {name} ({role}) · simulated', { name: u.name, role: t(ROLES[p.role].key, ROLES[p.role].en) }), 'success');
    if (switched && !opts.quiet && OT.shell && OT.shell.offer) {
      OT.shell.offer(t('ps.langSwitched', 'Language switched to {lang} for {name}.', { lang: OT.lang.info(p.lang).native, name: p.short }), t('ps.keep', 'Keep {lang}', { lang: OT.lang.info(prev).native }), function () { OT.i18n.setLang(prev); });
    }
    if (opts.route !== false) goHome(p.role);
  }
  function personasHTML(u) {
    return '<section class="login-personas" data-tour="personas"><div class="row between wrap"><div><h2 class="h3">' + OT.icon('users', 18) + ' ' + OT.esc(t('ps.title', 'Choose a demo persona')) + '</h2>' +
      '<p class="small muted">' + OT.esc(t('ps.sub', 'One click, no password. Each persona has a home city, a language, preferences and simulated trip history.')) + '</p></div>' + OT.simTag() + '</div>' +
      '<div class="persona-grid">' + OT.data.personas.list.map(function (p) { return personaCard(p, u); }).join('') + '</div></section>';
  }

  function renderLogin(el) {
    var u = OT.store.get('user');
    var d = ROLES[role].demo;
    el.innerHTML = '<div class="container page auth-page">' + personasHTML(u) + '<h2 class="h3 mt12">' + OT.esc(t('ps.email', 'Or sign in with email (simulated)')) + '</h2><div class="auth-grid">' +
      '<div class="auth-copy"><p class="ot-eyebrow">' + OT.icon('shield', 14) + ' ' + OT.esc(t('auth.sso', 'One IRCTC login for your whole journey (SSO concept)')) + '</p>' +
      '<h1>' + OT.esc(t('auth.title', 'Sign in')) + '</h1>' +
      '<p class="muted">' + OT.esc(t('auth.sub', 'Simulated sign-in for the demo. No real account, password or OTP is used or stored.')) + '</p>' +
      '<div class="auth-creds card-flat small"><strong>' + OT.esc(t('auth.demo', 'Demo accounts')) + '</strong><ul>' +
      Object.keys(ROLES).map(function (k) { return '<li><span>' + OT.esc(t(ROLES[k].key, ROLES[k].en)) + '</span><code>' + OT.esc(ROLES[k].demo.email) + '</code></li>'; }).join('') +
      '</ul><span class="xs muted">' + OT.esc(t('auth.demoPw', 'Password for all: demo-1234 (not checked, not stored)')) + '</span></div></div>' +
      '<div>' + (u ? signedInHTML(u) : '') +
      '<form class="card auth-form" id="login-form">' + rolePicker() +
      '<div class="field"><label for="lg-email">' + OT.esc(t('auth.email', 'Email or mobile')) + '</label><input id="lg-email" class="input" value="' + OT.esc(d.email) + '" autocomplete="off"></div>' +
      '<div class="field"><label for="lg-pw">' + OT.esc(t('auth.pw', 'Password')) + '</label><input id="lg-pw" class="input" type="password" value="demo-1234" autocomplete="off"></div>' +
      '<button type="submit" class="btn btn-primary btn-block">' + OT.icon('lock', 16) + OT.esc(t('auth.signin', 'Sign in (simulated)')) + '</button>' +
      '<p class="small center">' + OT.esc(t('auth.new', 'New here?')) + ' <a href="#/register">' + OT.esc(t('auth.register', 'Create an account')) + '</a></p></form></div></div></div>';
    bindCommon(el, renderLogin);
    OT.$$('[data-signin-persona]', el).forEach(function (b) { b.addEventListener('click', function () { signInPersona(b.getAttribute('data-signin-persona')); }); });
    el.querySelector('#login-form').addEventListener('submit', function (e) { e.preventDefault(); signIn(role, { email: el.querySelector('#lg-email').value.trim() || d.email }); });
  }

  function renderRegister(el) {
    var d = ROLES[role].demo, langs = OT.i18n.languages;
    el.innerHTML = '<div class="container page auth-page"><div class="auth-grid">' +
      '<div class="auth-copy"><p class="ot-eyebrow">' + OT.icon('shield', 14) + ' ' + OT.esc(t('auth.consentFirst', 'Consent first: every sharing option is off until you turn it on')) + '</p>' +
      '<h1>' + OT.esc(t('auth.regTitle', 'Create your OneTrip account')) + '</h1>' +
      '<p class="muted">' + OT.esc(t('auth.sub', 'Simulated sign-in for the demo. No real account, password or OTP is used or stored.')) + '</p></div>' +
      '<form class="card auth-form" id="reg-form">' + rolePicker() +
      '<div class="grid grid-2">' +
      '<div class="field"><label for="rg-name">' + OT.esc(t('auth.name', 'Full name')) + '</label><input id="rg-name" class="input" value="' + OT.esc(d.name) + '"></div>' +
      '<div class="field"><label for="rg-phone">' + OT.esc(t('auth.phone', 'Mobile')) + '</label><input id="rg-phone" class="input" value="' + OT.esc(d.phone) + '"></div>' +
      '<div class="field"><label for="rg-email">' + OT.esc(t('auth.emailOnly', 'Email')) + '</label><input id="rg-email" class="input" value="' + OT.esc(d.email) + '"></div>' +
      '<div class="field"><label for="rg-lang">' + OT.esc(t('auth.prefLang', 'Preferred language')) + '</label><select id="rg-lang" class="input">' + langs.map(function (l) { return '<option value="' + l.code + '"' + (l.code === OT.i18n.lang() ? ' selected' : '') + '>' + OT.esc(l.native) + ' · ' + OT.esc(l.name) + '</option>'; }).join('') + '</select></div>' +
      '</div>' +
      (role === 'partner' ? '<div class="grid grid-2 mt12">' +
        '<div class="field"><label for="rg-biz">' + OT.esc(t('auth.biz', 'Business name')) + '</label><input id="rg-biz" class="input" value="Hotel Shivalik View"></div>' +
        '<div class="field"><label for="rg-type">' + OT.esc(t('auth.bizType', 'Type')) + '</label><select id="rg-type" class="input"><option>Hotel</option><option>Homestay</option><option>Cab operator</option><option>Tour operator</option></select></div>' +
        '<div class="field"><label for="rg-gst">' + OT.esc(t('auth.gst', 'GSTIN (mock)')) + '</label><input id="rg-gst" class="input" value="04XXXXX0000X1ZX" disabled></div>' +
        '<div class="field"><label for="rg-bank">' + OT.esc(t('auth.settle', 'Settlement account (mock, masked)')) + '</label><input id="rg-bank" class="input" value="XXXX XXXX 4410" disabled></div></div>' : '') +
      '<fieldset class="consents mt12"><legend class="label">' + OT.esc(t('auth.consents', 'Consent (DPDP-style, all optional)')) + '</legend>' +
      '<label class="check"><input type="checkbox" id="cs-pers"> ' + OT.esc(t('auth.cPers', 'Personalised recommendations from my trip data')) + '</label>' +
      '<label class="check"><input type="checkbox" id="cs-mkt"> ' + OT.esc(t('auth.cMkt', 'Offers and marketing messages')) + '</label>' +
      '<label class="check"><input type="checkbox" id="cs-part"> ' + OT.esc(t('auth.cPart', 'Share my contact with partners I book')) + '</label></fieldset>' +
      '<button type="submit" class="btn btn-primary btn-block mt12">' + OT.esc(t('auth.create', 'Create account (simulated)')) + '</button>' +
      '<p class="small center">' + OT.esc(t('auth.have', 'Already registered?')) + ' <a href="#/login">' + OT.esc(t('auth.title', 'Sign in')) + '</a></p></form></div></div>';
    bindCommon(el, renderRegister);
    el.querySelector('#reg-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var lang = el.querySelector('#rg-lang').value;
      var extra = {
        name: el.querySelector('#rg-name').value.trim() || d.name, phone: el.querySelector('#rg-phone').value.trim(), email: el.querySelector('#rg-email').value.trim() || d.email,
        lang: lang, consents: { personalised: el.querySelector('#cs-pers').checked, marketing: el.querySelector('#cs-mkt').checked, partnerSharing: el.querySelector('#cs-part').checked }
      };
      var biz = el.querySelector('#rg-biz'); if (biz) extra.org = biz.value.trim();
      if (lang !== OT.i18n.lang()) OT.i18n.setLang(lang);
      signIn(role, extra);
    });
  }

  function bindCommon(el, rerender) {
    OT.$$('input[name="role"]', el).forEach(function (r) { r.addEventListener('change', function () { role = r.value; rerender(el); }); });
    var c = el.querySelector('#auth-continue'); if (c) c.addEventListener('click', function () { goHome((OT.store.get('user') || {}).role || 'traveller'); });
    var lo = el.querySelector('#auth-logout'); if (lo) lo.addEventListener('click', function () { OT.store.set('user', undefined); OT.toast(t('auth.loggedOut', 'Signed out.'), 'info'); rerender(el); });
  }

  OT.registerView('login', { title: function () { return OT.t('auth.title', 'Sign in'); }, section: 'login', render: function (el) { renderLogin(el); } });
  OT.registerView('register', { title: function () { return OT.t('auth.regTitle', 'Create your OneTrip account'); }, section: 'login', render: function (el) { renderRegister(el); } });
  OT.auth = { signIn: signIn, roles: ROLES, signInPersona: signInPersona };
})();
