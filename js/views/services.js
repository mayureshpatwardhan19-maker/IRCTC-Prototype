/* IRCTC OneTrip — book services INDIVIDUALLY, without a train (v1.2). SIMULATED.
 *   #/hotels?city=&in=&out=&guests=&rooms=&min=&max=     hotels with a visible budget range control
 *   #/transport?city=&from=&to=&date=&time=&pax=          cab · auto · bus · metro · e-rickshaw · walk, side by side
 *   #/food?city=&date=&guests=   ·   #/sights?city=&date=&guests=
 * Same verification/source rules as the agent flow (OT.agents.verifyOne / recommend). "Book" adds the item to a
 * lightweight trip ("Stay in Jaipur, 21–24 Nov") in My Journey and opens checkout (confirm + simulated payment).
 *
 *   OT.trip.ensure(city, {start, end, pax})  -> Promise<journey|null>   create or attach a trip
 *   OT.trip.add(x, opts) / OT.trip.book(x, opts)
 *   OT.transportUI.html(cmp, {action}) / bind(scope, cmp, onPick)
 */
(function () {
  'use strict';
  var OT = window.OT;
  var D = function () { return OT.data.travel; }, TX = function () { return OT.data.transport; };
  var root = null;
  function t(k, fb, v) { return OT.t(k, fb, v); }
  function L() { return OT.i18n.lang(); }
  function keep(v) { return OT.lang.keep(v); }
  function sname(c) { return D().stationName(c, L()); }
  function ymd(d) { return OT.data.rail.ymd(d); }
  function today() { return ymd(new Date()); }
  function plus(s, n) { return D().addDays(s, n); }
  function nightsBetween(a, b) { return Math.max(1, Math.round((OT.data.rail.parseYmd(b) - OT.data.rail.parseYmd(a)) / 86400000)); }
  function qs(o) { return Object.keys(o).filter(function (k) { return o[k] != null && o[k] !== ''; }).map(function (k) { return k + '=' + encodeURIComponent(o[k]); }).join('&'); }
  function user() { return OT.store.get('user') || {}; }
  function persona() { var u = user(); return u.personaId && OT.data.personas ? OT.data.personas.get(u.personaId) : null; }
  function defCity(q) {
    var j = OT.store.get('journey'), c = q.city || (j && j.scenario) || (user().homeCity === 'NDLS' ? 'CDG' : 'NDLS');
    return D().stations[c] ? c : 'CDG';
  }

  /* ================= trip model ================= */
  function tripTitle(j) { return t('trip.stayIn', 'Stay in {city}', { city: sname(j.scenario) }); }
  function newTrip(city, o) {
    var u = user();
    var start = o.start || plus(today(), 7), end = o.end && o.end >= start ? o.end : start;
    return { id: OT.uid('TRP'), kind: 'trip', scenario: city, city: city, start: start, end: end, nights: Math.max(1, nightsBetween(start, end)),
      pnr: null, train: null, returnTrain: null, returnOption: null, simulated: true,
      passengers: +o.pax || (u.party ? u.party.length : 2), budget: o.max || u.budget || 3000, budgetMin: o.min || 500,
      prefs: u.prefs ? JSON.parse(JSON.stringify(u.prefs)) : { nearStation: true }, items: [], createdAt: new Date().toISOString() };
  }
  function ensure(city, o) {
    o = o || {};
    var j = OT.store.get('journey');
    if (j && j.scenario === city) {
      if (!j.train) OT.store.update('journey', function (x) {
        if (o.start && (!x.start || o.start < x.start)) x.start = o.start;
        if (o.end && (!x.end || o.end > x.end)) x.end = o.end;
        x.nights = Math.max(1, nightsBetween(x.start, x.end));
        return x;
      });
      return Promise.resolve(OT.store.get('journey'));
    }
    var live = j && ((j.items || []).some(function (i) { return i.status !== 'cancelled'; }) || (j.train && j.train.status !== 'PLANNED'));
    var p = live ? OT.confirmAction({
      title: t('search.replaceTitle', 'Start a new trip?'),
      lines: [OT.esc(t('trip.replaceLine', 'My Journey currently shows your trip to {old}. Starting “{new}” replaces the plan; everything you already paid for stays in Bookings & refunds.', { old: sname(j.scenario), new: t('trip.stayIn', 'Stay in {city}', { city: sname(city) }) }))],
      confirmLabel: t('search.replaceOk', 'Start new trip')
    }) : Promise.resolve(true);
    return p.then(function (ok) {
      if (!ok) return null;
      var nj = newTrip(city, o);
      OT.store.set('journey', nj);
      OT.state.lastRun = null;
      return nj;
    });
  }
  /** opts: {start, end, when, endWhen, nights, rooms, pax} */
  function add(x, opts) {
    opts = opts || {};
    var j = OT.store.get('journey'); if (!j || !x) return null;
    if (TX().isMeter(x)) { OT.toast(t('tx.noBookAuto', 'Autos and e-rickshaws are not booked online: pay the driver on the meter.'), 'info'); return null; }
    var v = OT.agents.verifyOne(x);
    if (v.verdict === 'unavailable') { OT.toast(t('res.cannotAdd', 'This option is unavailable at source.'), 'error'); return null; }
    var slot = opts.when ? { when: opts.when, endWhen: opts.endWhen } : OT.agents.slotFor(x, j);
    j.items = (j.items || []).filter(function (i) {
      if (i.status !== 'selected') return true;
      if (x.type === 'hotel' && i.type === 'hotel') return false;          // one planned stay at a time
      if (x.legKey && D().get(i.refId) && D().get(i.refId).legKey === x.legKey) return false;   // one mode per leg
      return i.refId !== x.id;
    });
    var item = { id: OT.uid('IT'), type: x.type, refId: x.id, partnerId: x.partnerId, title: x.name, provider: x.provider, price: v.livePrice, listedPrice: x.price,
      when: slot.when, endWhen: slot.endWhen, status: 'selected', verification: v.verdict, city: x.city, addedAt: new Date().toISOString(), priceAccepted: v.livePrice === x.price,
      standalone: !j.train || !!opts.standalone };
    if (opts.nights) item.nights = opts.nights;
    if (opts.rooms) item.rooms = opts.rooms;
    if (opts.pax) item.pax = opts.pax;
    j.items.push(item);
    OT.store.set('journey', j);
    return item;
  }
  function book(x, opts, go) {
    opts = opts || {};
    return ensure(x.city, opts).then(function (j) {
      if (!j) return null;
      var it = add(x, opts);
      if (!it) return null;
      if (go === false) {
        OT.toast(t('svc.addedTrip', '{name} added to {trip}.', { name: x.name, trip: j.train ? t('nav.journey', 'My Journey') : tripTitle(j) }), 'success');
        return it;
      }
      OT.toast(t('svc.toCheckout', 'Added to {trip}. Review and pay below.', { trip: j.train ? t('nav.journey', 'My Journey') : tripTitle(j) }), 'info');
      OT.go('checkout');
      return it;
    });
  }
  OT.trip = { ensure: ensure, add: add, book: book, title: tripTitle, newTrip: newTrip };

  /* ================= pay-on-meter rides (v1.2.1) =================
   * Auto-rickshaws and shared e-rickshaws are never booked: no cart line, no charge, no booking ref, nothing in
   * Bookings & refunds or a partner dashboard. The traveller may still mark "I'll take an auto" in the journey flow;
   * that lives in journey.meterRides = [{id, mode, legKey, refId?, city, title, approx, perPerson, pax, basis, minutes, when, endWhen, note}]
   * and shows in the plan, timeline and one-page itinerary as "pay on meter, ≈ ₹X". */
  var MODE_EN = { auto: ['tx.auto', 'Auto-rickshaw'], erick: ['tx.erick', 'E-rickshaw (shared)'] };
  function meterApprox(r) {
    if (!r) return '';
    if (r.mode === 'erick') return t('tx.approxPP', '≈ {p} per person', { p: OT.inr(r.perPerson) });
    if (r.basis === 'booth') return t('tx.approxBooth', '≈ {p} fixed fare at the booth', { p: OT.inr(r.approx) });
    return t('tx.approxMeter', '≈ {p} on meter', { p: OT.inr(r.approx) });
  }
  function meterNoteText(r) { var n = r && r.note; return n ? t(n[0], n[1], n[2]) : t('tx.noBookingPay', 'No booking needed: pay the driver.'); }
  function meterList(j) { j = j || OT.store.get('journey'); return (j && Array.isArray(j.meterRides)) ? j.meterRides.filter(function (r) { return r && r.mode; }) : []; }
  function meterSave(fn) {
    var j = OT.store.get('journey'); if (!j) return null;
    j.meterRides = meterList(j);
    var out = fn(j);
    OT.store.set('journey', j);
    return out;
  }
  function rideFromOption(cmp, o, j) {
    j = j || OT.store.get('journey') || {};
    var d0 = cmp.date || (j.train ? (j.train.arrDate || j.train.date) : (j.start || today()));
    var when = d0 + 'T' + (cmp.time || '12:00');
    var name = t(MODE_EN[o.mode][0], MODE_EN[o.mode][1]);
    return { id: OT.uid('MTR'), mode: o.mode, legKey: cmp.legKey, city: cmp.city, title: name + ': ' + cmp.from.short + ' → ' + cmp.to.short, titleEn: (o.en || o.mode) + ': ' + cmp.from.short + ' → ' + cmp.to.short,
      approx: o.total, perPerson: o.perPerson, pax: cmp.pax, basis: 'meter', minutes: o.minutes, km: o.km, when: when, endWhen: OT.agents.time.addMinIso(when, o.minutes || 15),
      note: o.note2 || null, station: cmp.from.kind === 'station', addedAt: new Date().toISOString() };
  }
  function rideFromItem(x, j) {
    j = j || OT.store.get('journey') || {};
    var slot = j.train || j.kind === 'trip' ? OT.agents.slotFor(x, j) : {};
    return { id: OT.uid('MTR'), mode: 'auto', legKey: 'cat:' + x.id, refId: x.id, city: x.city, title: x.name, titleEn: x.name, approx: x.price, perPerson: Math.round(x.price / Math.max(1, j.passengers || 1)),
      pax: j.passengers || 1, basis: 'booth', minutes: x.durationMin || 15, when: slot.when || null, endWhen: slot.endWhen || (slot.when ? OT.agents.time.addMinIso(slot.when, x.durationMin || 15) : null),
      note: ['tx.meterBooth', 'No booking needed: {meet}. Pay at the booth or to the driver.', { meet: x.meet || '' }], station: x.offsetMin != null, addedAt: new Date().toISOString() };
  }
  /** Mark a ride (replaces a planned mode for the same leg). Returns the ride. */
  function meterAdd(ride) {
    if (!ride) return null;
    return meterSave(function (j) {
      j.meterRides = j.meterRides.filter(function (r) { return r.legKey !== ride.legKey; });
      // one way per leg: drop an unpaid cab/bus/metro planned for the same leg (paid bookings stay untouched)
      j.items = (j.items || []).filter(function (i) { var y = D().get(i.refId); return !(i.status === 'selected' && y && y.legKey && y.legKey === ride.legKey); });
      j.meterRides.push(ride);
      return ride;
    });
  }
  function meterRemove(id) { return meterSave(function (j) { j.meterRides = j.meterRides.filter(function (r) { return r.id !== id; }); return true; }); }
  /** Drop the meter ride for a leg (called when a bookable mode is picked for that leg). */
  function meterDropLeg(legKey) {
    if (!legKey || !meterList().some(function (r) { return r.legKey === legKey; })) return;
    meterSave(function (j) { j.meterRides = j.meterRides.filter(function (r) { return r.legKey !== legKey; }); });
  }
  /** Older saved data: a planned (unpaid) auto / e-rickshaw sitting in journey.items becomes a pay-on-meter ride. */
  function meterMigrate() {
    var j = OT.store.get('journey'); if (!j || !Array.isArray(j.items)) return false;
    var moved = [];
    j.items = j.items.filter(function (i) {
      var x = i && i.status === 'selected' && D().get(i.refId);
      if (!x || !TX().isMeter(x)) return true;
      moved.push(x.leg ? { id: OT.uid('MTR'), mode: x.mode === 'erick' ? 'erick' : 'auto', legKey: x.legKey, city: x.city, title: i.title, titleEn: i.title, approx: x.basis === 'person' ? x.price * (i.pax || j.passengers || 1) : x.price,
        perPerson: x.basis === 'person' ? x.price : Math.round(x.price / Math.max(1, j.passengers || 1)), pax: i.pax || j.passengers || 1, basis: 'meter', minutes: x.durationMin || 15, when: i.when || null, endWhen: i.endWhen || null, note: null, addedAt: i.addedAt }
        : Object.assign(rideFromItem(x, j), { when: i.when || null }));
      return false;
    });
    if (!moved.length) return false;
    j.meterRides = meterList(j).concat(moved);
    OT.store.set('journey', j);
    return true;
  }
  OT.meter = { list: meterList, add: meterAdd, remove: meterRemove, dropLeg: meterDropLeg, fromOption: rideFromOption, fromItem: rideFromItem, approx: meterApprox, note: meterNoteText, migrate: meterMigrate,
    total: function (j) { return meterList(j).reduce(function (s, r) { return s + (r.approx || 0); }, 0); } };

  /* ================= shared bits ================= */
  function cityPicker(id, code, label) { return OT.trains.picker(id, code, label || t('svc.city', 'City, area or station')); }
  function headHTML(icon, title, sub) {
    return '<div class="page-head svc-head"><div><p class="ot-eyebrow">' + OT.icon(icon, 14) + ' ' + OT.esc(t('svc.eyebrow', 'Book on its own, no train needed')) + '</p><h1>' + OT.esc(title) + '</h1>' +
      '<p>' + OT.esc(sub) + '</p></div><a class="btn btn-ghost btn-sm" href="#/trains">' + OT.icon('train', 15) + OT.esc(t('svc.orTrain', 'Or start with a train')) + '</a></div>';
  }
  function inTrip(refId) { var j = OT.store.get('journey'); return j && (j.items || []).filter(function (i) { return i.refId === refId && i.status !== 'cancelled'; })[0]; }
  function tripNote(city) {
    var j = OT.store.get('journey'); if (!j) return '';
    if (city && j.scenario !== city) {
      // the searched city differs from the current trip: say what will happen instead of claiming the booking attaches to it
      return '<div class="trip-note card-flat small" data-trip-other>' + OT.icon('route', 16) + '<span>' + OT.esc(t('svc.otherTrip', 'Your current trip is to {old}. Booking in {city} starts a new trip “{trip}”; we ask before replacing anything, and paid bookings stay in Bookings & refunds.', { old: sname(j.scenario), city: sname(city), trip: t('trip.stayIn', 'Stay in {city}', { city: sname(city) }) })) +
        '</span><a class="btn btn-ghost btn-sm" href="#/journey">' + OT.esc(t('nav.journey', 'My Journey')) + '</a></div>';
    }
    var n = (j.items || []).filter(function (i) { return i.status === 'selected'; }).length;
    return '<div class="trip-note card-flat small">' + OT.icon('route', 16) + '<span>' + OT.esc(j.train ? t('svc.attachTrain', 'Bookings here attach to your journey to {city} (train {no}).', { city: sname(j.scenario), no: j.train.no }) : t('svc.attachTrip', 'Bookings here attach to your trip “{trip}”.', { trip: tripTitle(j) })) +
      (n ? ' ' + OT.esc(t('svc.unpaid', '{n} item(s) waiting to be paid.', { n: n })) : '') + '</span><a class="btn btn-ghost btn-sm" href="#/journey">' + OT.esc(t('nav.journey', 'My Journey')) + '</a>' +
      (n ? '<a class="btn btn-primary btn-sm" href="#/checkout">' + OT.esc(t('journey.checkout', 'Review & pay ({n})', { n: n })) + '</a>' : '') + '</div>';
  }
  function verifiedFor(city, type) {
    if (D().ensureCity) D().ensureCity(city);
    return D().byCity(city, type).filter(function (x) { return !x.leg && !x.onTrain; }).map(function (x) { return OT.agents.verifyOne(x); });
  }
  function bindCards(el, onBook, onAdd) {
    OT.$$('[data-book-now]', el).forEach(function (b) { b.addEventListener('click', function () { onBook(D().get(b.getAttribute('data-book-now'))); }); });
    OT.$$('[data-add-trip]', el).forEach(function (b) { b.addEventListener('click', function () { onAdd(D().get(b.getAttribute('data-add-trip'))); }); });
    OT.$$('[data-recheck]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        b.disabled = true; b.textContent = t('res.rechecking', 'Re-checking…');
        OT.sleep(600).then(function () { OT.agents.recheck(b.getAttribute('data-recheck')); OT.toast(t('res.recheckedToast', 'Re-checked at source just now.'), 'success'); if (root) OT.router.render(); });
      });
    });
  }
  function cards(list) { return list.map(function (v) { return OT.resultsUI.card(v, { standalone: true, added: !!inTrip(v.item.id) }); }).join(''); }

  /* ================= HOTELS ================= */
  function renderHotels(el, q) {
    var city = defCity(q), u = user();
    var cin = q['in'] && q['in'] >= today() ? q['in'] : plus(today(), 7), cout = q.out && q.out > cin ? q.out : plus(cin, 2);
    var guests = Math.max(1, Math.min(9, +q.guests || (u.party ? u.party.length : 2))), rooms = Math.max(1, Math.min(5, +q.rooms || Math.ceil(guests / 2)));
    var r = OT.budget.norm(q.min || 500, q.max || u.budget || 15000), lo = r[0], hi = r[1];
    var all = verifiedFor(city, 'hotel');
    el.innerHTML = '<div class="container page svc-page">' + headHTML('hotel', t('svc.hotelsIn', 'Hotels in {city}', { city: sname(city) }), t('svc.hotelsSub', 'Every price and rating is re-checked at the provider, with source and check time. Set your budget per night below.')) +
      tripNote(city) +
      '<form class="card svc-form" id="svc-form" novalidate data-tour="svc-hotel-form"><div class="svc-grid">' + cityPicker('sv-city', city) +
      '<div class="field"><label for="sv-in">' + OT.esc(t('svc.checkin', 'Check-in')) + '</label><input id="sv-in" class="input" type="date" min="' + today() + '" value="' + cin + '"></div>' +
      '<div class="field"><label for="sv-out">' + OT.esc(t('svc.checkout', 'Check-out')) + '</label><input id="sv-out" class="input" type="date" min="' + plus(today(), 1) + '" value="' + cout + '"></div>' +
      '<div class="field"><label for="sv-guests">' + OT.esc(t('svc.guests', 'Guests')) + '</label><select id="sv-guests" class="input">' + [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return '<option' + (n === guests ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="sv-rooms">' + OT.esc(t('svc.rooms', 'Rooms')) + '</label><select id="sv-rooms" class="input">' + [1, 2, 3, 4, 5].map(function (n) { return '<option' + (n === rooms ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div></div>' +
      OT.budget.html({ id: 'hb', lo: lo, hi: hi }) +
      '<p class="form-error hidden" id="sv-err" role="alert"></p>' +
      '<button type="submit" class="btn btn-primary" id="sv-go">' + OT.icon('search', 16) + OT.esc(t('svc.searchHotels', 'Search hotels')) + '</button></form>' +
      '<div class="svc-list" id="svc-list" data-tour="svc-results"></div></div>';
    function list() {
      var rr = OT.budget.norm(el.querySelector('#hb-lo').value, el.querySelector('#hb-hi').value);
      var rec = OT.agents.recommend(all, { to: city, budget: rr[1], budgetMin: rr[0], prefs: u.prefs || {}, nearStation: true });
      var shown = rec.byType.hotel, avail = all.filter(function (v) { return v.verdict !== 'unavailable'; });
      OT.budget.count(el, 'hb', shown.length, avail.length);
      var box = el.querySelector('#svc-list');
      box.innerHTML = (shown.length ? cards(shown) : '<div class="card empty-state">' + OT.icon('filter', 28) + '<p class="muted">' + OT.esc(t('svc.noneBudget', 'No verified hotel in this budget. Widen the range.')) + '</p></div>') + hiddenHTML(rec, rr);
      bindCards(box, function (x) { bookHotel(x, true); }, function (x) { bookHotel(x, false); });
    }
    function form() {
      var c = OT.trains.codeOf(el, 'sv-city'), a = el.querySelector('#sv-in').value, b = el.querySelector('#sv-out').value;
      var err = el.querySelector('#sv-err');
      var msg = !c ? t('svc.errCity', 'Pick a city or station from the list.') : !a || a < today() ? t('trn.errPast', 'That date is in the past. Pick today or a later date.') : !b || b <= a ? t('svc.errOut', 'Check-out must be after check-in.') : '';
      if (msg) { err.textContent = msg; err.classList.remove('hidden'); return null; }
      err.classList.add('hidden');
      var rr = OT.budget.norm(el.querySelector('#hb-lo').value, el.querySelector('#hb-hi').value);
      return { city: c, 'in': a, out: b, guests: +el.querySelector('#sv-guests').value, rooms: +el.querySelector('#sv-rooms').value, min: rr[0], max: rr[1] };
    }
    function bookHotel(x, go) {
      var f = form(); if (!f || !x) return;
      if (f.city !== city) { OT.go('hotels?' + qs(f)); return; }
      var n = nightsBetween(f['in'], f.out);
      OT.store.update('journey', function (j) { if (j && j.scenario === city) { j.budget = f.max; j.budgetMin = f.min; } return j; });
      book(x, { start: f['in'], end: f.out, when: f['in'] + 'T' + (x.checkIn || '12:00'), endWhen: f.out + 'T' + (x.checkOut || '11:00'), nights: n, rooms: f.rooms, pax: f.guests, max: f.max, min: f.min, standalone: true }, go);
    }
    OT.trains.bindPicker(el, 'sv-city');
    OT.budget.bind(el, 'hb', function () { list(); });
    el.querySelector('#svc-form').addEventListener('submit', function (e) { e.preventDefault(); var f = form(); if (f) OT.go('hotels?' + qs(f)); });
    list();
  }
  function hiddenHTML(rec, rr) {
    var h = rec.hidden.filter(function (x) { return x.v.item.type === 'hotel'; }), f = rec.filtered.filter(function (x) { return x.v.item.type === 'hotel' && x.reason !== 'dismissed'; });
    if (!h.length && !f.length) return '';
    return '<details class="hidden-list card-flat"><summary>' + OT.icon('eye', 15) + ' ' + OT.esc(t('res.hiddenTitle', 'Hidden or filtered by agents ({n})', { n: h.length + f.length })) + '</summary><ul>' +
      h.map(function (x) { return '<li>' + OT.badge('unavailable') + ' <strong>' + OT.esc(x.v.item.name) + '</strong>: ' + OT.esc(t('res.hidSold', 'sold out at provider source (Verification Agent)')) + '</li>'; }).join('') +
      f.map(function (x) {
        return '<li><span class="badge b-info">' + OT.icon('filter', 12) + '<span>' + OT.esc(t('res.filtered', 'Filtered')) + '</span></span> <strong>' + OT.esc(x.v.item.name) + '</strong>: ' +
          OT.lang.highlight(x.reason === 'budgetMin' ? t('res.hidBudgetMin', '{p} is below your minimum {b}', { p: OT.inr(x.v.livePrice), b: OT.inr(rr[0]) }) : t('res.hidBudget', '{p} is over your {b} budget (Recommendation Agent)', { p: OT.inr(x.v.livePrice), b: OT.inr(rr[1]) })) + '</li>';
      }).join('') + '</ul></details>';
  }

  /* ================= LOCAL TRANSPORT ================= */
  var KIND_ICON = { station: 'train', airport: 'send', hotel: 'hotel', landmark: 'sight' };
  function placePicker(id, city, value, label) {
    var p = value && TX().place(city, value);
    return '<div class="field st-pick" data-place-picker="' + id + '"><label for="' + id + '">' + OT.esc(label) + '</label>' +
      '<input id="' + id + '" class="input" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="' + id + '-list" placeholder="' + OT.esc(t('tx.placePh', 'Station, airport, hotel or landmark')) + '" value="' + (p ? OT.esc(p.short) : '') + '" data-place="' + OT.esc(p ? p.id : '') + '">' +
      '<ul class="st-list" id="' + id + '-list" role="listbox" hidden></ul></div>';
  }
  function bindPlacePicker(scope, id, getCity) {
    var inp = scope.querySelector('#' + id), list = scope.querySelector('#' + id + '-list'); if (!inp) return;
    var items = [], act = -1;
    function close() { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); act = -1; }
    function pick(p) { inp.value = p.short; inp.setAttribute('data-place', p.id); close(); }
    function show() {
      var q = inp.getAttribute('data-place') ? '' : inp.value.trim().toLowerCase();
      items = TX().places(getCity()).filter(function (p) { return !q || p.name.toLowerCase().indexOf(q) >= 0; }).slice(0, 12);
      list.innerHTML = items.map(function (p, i) {
        return '<li role="option" data-pl="' + i + '"' + (i === act ? ' aria-selected="true"' : '') + '>' + OT.icon(KIND_ICON[p.kind] || 'pin', 14) + ' <strong>' + OT.esc(p.short) + '</strong> <span class="xs muted">' + OT.esc(t('tx.kind.' + p.kind, p.kind)) + (p.km ? ' · ' + p.km + ' km' : '') + '</span></li>';
      }).join('') || '<li class="muted xs">' + OT.esc(t('tx.noPlace', 'No place found in this city')) + '</li>';
      list.hidden = false; inp.setAttribute('aria-expanded', 'true');
    }
    inp.addEventListener('focus', function () { inp.select(); show(); });
    inp.addEventListener('input', function () { inp.setAttribute('data-place', ''); act = -1; show(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(0, Math.min(items.length - 1, act + (e.key === 'ArrowDown' ? 1 : -1))); show(); }
      else if (e.key === 'Enter' && !list.hidden && items.length) { e.preventDefault(); pick(items[Math.max(0, act)]); }
      else if (e.key === 'Escape') close();
    });
    inp.addEventListener('blur', function () { setTimeout(function () { if (!inp.getAttribute('data-place') && items.length && inp.value.trim()) pick(items[0]); close(); }, 160); });
    list.addEventListener('mousedown', function (e) { var li = e.target.closest('[data-pl]'); if (li) { e.preventDefault(); pick(items[+li.getAttribute('data-pl')]); } });
  }

  var BADGE = { cheapest: ['tx.cheapest', 'Cheapest', 'b-ok'], fastest: ['tx.fastest', 'Fastest', 'b-info'], group: ['tx.group', 'Best for your group', 'b-top'] };
  var LUG = { yes: ['tx.lugYes', 'Yes, boot space'], some: ['tx.lugSome', '1 bag each'], no: ['tx.lugNo', 'Not with big bags'] };
  function dots(n) { var s = ''; for (var i = 1; i <= 5; i++) s += '<i class="' + (i <= n ? 'on' : '') + '"></i>'; return '<span class="tx-dots" role="img" aria-label="' + n + '/5">' + s + '</span>'; }
  function co2(g) { return g >= 1000 ? (Math.round(g / 100) / 10) + ' kg' : g + ' g'; }
  /** Side-by-side comparison. opts.action: 'select' (journey) | 'book' (standalone). */
  function txHTML(cmp, opts) {
    opts = opts || {};
    var sel = opts.selected || {}, meterSel = {};
    meterList().forEach(function (r) { if (r.legKey === cmp.legKey) meterSel[r.mode] = true; });
    return '<section class="tx-compare" data-tour="transport-compare" aria-label="' + OT.esc(t('tx.title', 'Compare local transport')) + '">' +
      '<div class="tx-head"><div><h2 class="h3">' + OT.icon('route', 18) + ' ' + OT.esc(opts.title || t('tx.title', 'Compare local transport')) + '</h2>' +
      '<p class="small muted">' + OT.lang.highlight(t('tx.leg', '{from} → {to} · {km} km · {n} traveller(s) · {time}', { from: cmp.from.short, to: cmp.to.short, km: cmp.km, n: cmp.pax, time: cmp.time })) + '</p></div>' + OT.simTag() + '</div>' +
      '<div class="tx-grid">' + cmp.options.map(function (o) {
        var v = o.item ? OT.agents.verifyOne(o.item) : null, chosen = o.item && sel[o.item.id];
        var label = t(o.key, o.en) + (o.system ? ' · ' + o.system : '');
        return '<article class="tx-card' + (o.available ? '' : ' is-off') + (chosen ? ' is-on' : '') + '" data-mode="' + o.mode + '"' + (o.item ? ' data-ref="' + o.item.id + '"' : '') + '>' +
          '<div class="tx-top"><span class="tx-ic">' + OT.icon(o.icon, 20) + '</span><strong>' + OT.esc(label) + '</strong></div>' +
          '<div class="tx-badges">' + (o.badges || []).map(function (b) { return '<span class="badge ' + BADGE[b][2] + '" data-badge="' + b + '">' + OT.esc(t(BADGE[b][0], BADGE[b][1])) + '</span>'; }).join('') + '</div>' +
          (o.available ? (o.meter ? '<div class="tx-price tx-price-meter"><bdi class="keep">' + OT.esc(o.mode === 'erick' ? t('tx.approxPP', '≈ {p} per person', { p: OT.inr(o.perPerson) }) : t('tx.approxMeter', '≈ {p} on meter', { p: OT.inr(o.total) })) + '</bdi><span class="xs muted">' +
              OT.esc(o.mode === 'erick' ? t('tx.approxTotal', 'about {p} for {n}, paid to the driver', { p: OT.inr(o.total), n: cmp.pax }) : o.vehicles > 1 ? t('tx.approxAutos', '{v} autos · paid to the driver', { v: o.vehicles }) : t('tx.payDriver', 'paid to the driver')) + '</span></div>'
            : '<div class="tx-price"><bdi class="keep">' + OT.esc(o.total ? OT.inr(o.total) : t('res.free', 'Free')) + '</bdi><span class="xs muted">' + OT.esc(o.total ? t('tx.perPerson', '{p} per person · total for {n}', { p: OT.inr(o.perPerson), n: cmp.pax }) : t('tx.noTicket', 'No ticket needed')) + '</span></div>') +
            '<dl class="tx-facts xs">' +
            '<div><dt>' + OT.esc(t('tx.time', 'Travel time')) + '</dt><dd><bdi>' + o.minutes + '</bdi> ' + OT.esc(t('time.min', 'min')) + (o.waitMin ? ' <span class="muted">+' + o.waitMin + ' ' + OT.esc(t('tx.wait', 'wait')) + '</span>' : '') + '</dd></div>' +
            '<div><dt>' + OT.esc(t('tx.freq', 'Frequency')) + '</dt><dd>' + OT.esc(o.freq ? t('tx.every', 'every {n} min', { n: o.freq }) : o.mode === 'walk' ? '—' : t('tx.onDemand', 'On demand')) + '</dd></div>' +
            '<div><dt>' + OT.esc(t('tx.comfort', 'Comfort')) + '</dt><dd>' + dots(o.comfort) + '</dd></div>' +
            '<div><dt>' + OT.esc(t('tx.luggage', 'Luggage')) + '</dt><dd>' + OT.esc(t(LUG[o.luggage][0], LUG[o.luggage][1])) + '</dd></div>' +
            '<div><dt>' + OT.esc(t('tx.door', 'Door-to-door')) + '</dt><dd>' + OT.esc(o.door ? t('common.yes', 'Yes') : t('tx.walkM', 'No · {m} m walk', { m: o.walkM })) + '</dd></div>' +
            '<div><dt>CO₂</dt><dd>' + OT.esc(co2(o.co2g)) + '</dd></div></dl>' +
            (o.meter ? '<div class="tx-ver"><span class="badge b-info">' + OT.icon('info', 12) + '<span>' + OT.esc(t('tx.meterBadge', 'Pay on meter')) + '</span></span><span class="xs muted">' + OT.esc(o.src || '') + '</span></div>' : '') +
            (o.meter ? '' : v ? '<div class="tx-ver">' + OT.badge(v.verdict) + '<span class="xs muted">' + OT.esc(o.item.source.name) + ' · ' + OT.esc(t('res.checked', 'checked')) + ' ' + OT.esc(OT.stamp(new Date(v.sourceCheckedAt)).replace(/^\d+ \w+ \d+, /, '')) + '</span></div>' : '<div class="tx-ver"><span class="xs muted">' + OT.esc(t('tx.walkSrc', 'Map distance (simulated)')) + '</span></div>') +
            (o.meter ? '<p class="tx-meter xs" data-meter-note>' + OT.icon('info', 13) + ' <span>' + OT.esc(t(o.note2[0], o.note2[1], o.note2[2])) + '</span></p><div class="tx-act">' +
              (opts.action === 'select' ? (meterSel[o.mode] ? '<button type="button" class="btn btn-ghost btn-sm added" data-tx-meter="' + o.mode + '" disabled>' + OT.icon('check', 14) + OT.esc(t('tx.meterPlanned', 'In your plan · pay on meter')) + '</button>'
                : '<button type="button" class="btn btn-ghost btn-sm" data-tx-meter="' + o.mode + '">' + OT.esc(o.mode === 'erick' ? t('tx.takeErick', 'I’ll take an e-rickshaw') : t('tx.takeAuto', 'I’ll take an auto')) + '</button>')
                : '<span class="xs muted">' + OT.esc(t('tx.noBooking', 'No booking needed')) + '</span>') + '</div>' :
            '<div class="tx-act">' + (o.item ? (chosen ? '<button type="button" class="btn btn-ghost btn-sm added" data-tx-pick="' + o.item.id + '" disabled>' + OT.icon('check', 14) + OT.esc(t('tx.selected', 'Selected')) + '</button>'
              : '<button type="button" class="btn ' + (o.badges && o.badges.indexOf('group') >= 0 ? 'btn-primary' : 'btn-ghost') + ' btn-sm" data-tx-pick="' + o.item.id + '">' + OT.esc(opts.action === 'book' ? t('tx.book', 'Book') : t('tx.select', 'Select')) + '</button>')
              : '<span class="xs muted">' + OT.esc(t('tx.noBooking', 'No booking needed')) + '</span>') + '</div>')
            : '<p class="tx-off small">' + OT.icon('info', 14) + ' ' + OT.lang.highlight(t(o.reason[0], o.reason[1], o.reason[2])) + '</p>') +
          '</article>';
      }).join('') + '</div>' +
      '<p class="xs muted tx-foot">' + OT.esc(t('tx.foot', 'Fares, times and CO₂ are simulated estimates for this prototype (deterministic, per party). Metro shown only in cities that have one. Cab fares include tolls-free city driving; night fares apply 23:00–05:00.')) + '</p></section>';
  }
  function txBind(scope, cmp, onPick) {
    OT.$$('[data-tx-pick]', scope).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-tx-pick'), o = cmp.options.filter(function (x) { return x.item && x.item.id === id; })[0];
        if (o) onPick(o);
      });
    });
    OT.$$('[data-tx-meter]', scope).forEach(function (b) {
      b.addEventListener('click', function () {
        var o = cmp.options.filter(function (x) { return x.mode === b.getAttribute('data-tx-meter'); })[0];
        if (!o || !OT.store.get('journey')) return;
        var r = meterAdd(rideFromOption(cmp, o));
        OT.toast(t('tx.meterAdded', '{name} added to your plan: {approx}, pay the driver. Nothing is charged here.', { name: r.title, approx: meterApprox(r) }), 'success');
        if (onPick.meter) onPick.meter(r); else if (root) OT.router.render();
      });
    });
  }
  OT.transportUI = { html: txHTML, bind: txBind };

  function renderTransport(el, q) {
    var city = defCity(q), u = user(), P = TX().places(city);
    var from = q.from && TX().place(city, q.from) ? q.from : 'stn:' + city;
    var to = q.to && TX().place(city, q.to) ? q.to : ((P.filter(function (p) { return p.kind === 'hotel'; })[0] || P[1] || P[0]).id);
    var date = q.date && q.date >= today() ? q.date : plus(today(), 1), time = /^\d{2}:\d{2}$/.test(q.time || '') ? q.time : '11:30';
    var pax = Math.max(1, Math.min(9, +q.pax || (u.party ? u.party.length : 2)));
    var cmp = TX().compare({ city: city, from: from, to: to, date: date, time: time, pax: pax, persona: persona() || u });
    el.innerHTML = '<div class="container page svc-page">' + headHTML('cab', t('tx.pageTitle', 'Local transport in {city}', { city: sname(city) }), t('tx.pageSub', 'Cab, auto, bus, metro and e-rickshaw compared side by side for your group, with honest availability.')) +
      tripNote(city) +
      '<form class="card svc-form" id="tx-form" novalidate data-tour="svc-tx-form"><div class="svc-grid tx-form-grid">' + cityPicker('tx-city', city) +
      placePicker('tx-from', city, from, t('search.from', 'From')) + placePicker('tx-to', city, to, t('search.to', 'To')) +
      '<div class="field"><label for="tx-date">' + OT.esc(t('search.date', 'Travel date')) + '</label><input id="tx-date" class="input" type="date" min="' + today() + '" value="' + date + '"></div>' +
      '<div class="field"><label for="tx-time">' + OT.esc(t('tx.timeLbl', 'Time')) + '</label><input id="tx-time" class="input" type="time" value="' + time + '"></div>' +
      '<div class="field"><label for="tx-pax">' + OT.esc(t('search.pax', 'Travellers')) + '</label><select id="tx-pax" class="input">' + [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return '<option' + (n === pax ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div></div>' +
      '<p class="form-error hidden" id="tx-err" role="alert"></p>' +
      '<button type="submit" class="btn btn-primary" id="tx-go">' + OT.icon('route', 16) + OT.esc(t('tx.compareBtn', 'Compare options')) + '</button></form>' +
      '<div id="tx-out">' + txHTML(cmp, { action: 'book', selected: selectedMap() }) + '</div></div>';
    OT.trains.bindPicker(el, 'tx-city', function (c) { OT.go('transport?' + qs({ city: c, date: date, time: time, pax: pax })); });
    bindPlacePicker(el, 'tx-from', function () { return city; });
    bindPlacePicker(el, 'tx-to', function () { return city; });
    el.querySelector('#tx-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = el.querySelector('#tx-from').getAttribute('data-place'), tt = el.querySelector('#tx-to').getAttribute('data-place'), d = el.querySelector('#tx-date').value, err = el.querySelector('#tx-err');
      var msg = !f || !tt ? t('tx.errPick', 'Pick a From and a To place from the list.') : f === tt ? t('tx.errSame', 'From and To must be different places.') : !d || d < today() ? t('trn.errPast', 'That date is in the past. Pick today or a later date.') : '';
      if (msg) { err.textContent = msg; err.classList.remove('hidden'); return; }
      OT.go('transport?' + qs({ city: OT.trains.codeOf(el, 'tx-city') || city, from: f, to: tt, date: d, time: el.querySelector('#tx-time').value || time, pax: el.querySelector('#tx-pax').value }));
    });
    txBind(el, cmp, function (o) {
      var when = date + 'T' + time;
      book(o.item, { start: date, end: date, when: when, endWhen: OT.agents.time.addMinIso(when, o.minutes), pax: o.item.basis === 'person' ? pax : null, standalone: true });
    });
  }
  function selectedMap() { var j = OT.store.get('journey'), m = {}; (j && j.items || []).forEach(function (i) { if (i.status !== 'cancelled') m[i.refId] = true; }); return m; }

  /* ================= FOOD + SIGHTS ================= */
  function renderSimple(el, q, type) {
    var city = defCity(q), u = user();
    var date = q.date && q.date >= today() ? q.date : plus(today(), 1);
    var guests = Math.max(1, Math.min(9, +q.guests || (u.party ? u.party.length : 2)));
    var all = verifiedFor(city, type).filter(function (v) { return !v.item.service; });
    var rec = OT.agents.recommend(all, { to: city, prefs: u.prefs || {} });
    var isFood = type === 'food';
    el.innerHTML = '<div class="container page svc-page">' + headHTML(type, isFood ? t('svc.foodIn', 'Food in {city}', { city: sname(city) }) : t('svc.sightsIn', 'Sightseeing in {city}', { city: sname(city) }),
      isFood ? t('svc.foodSub', 'Restaurant tables and meals near the station, verified at source.') : t('svc.sightsSub', 'Entry tickets and tours with fees checked at the counter source.')) +
      tripNote(city) +
      '<form class="card svc-form" id="sf-form" novalidate><div class="svc-grid sf-grid">' + cityPicker('sf-city', city) +
      '<div class="field"><label for="sf-date">' + OT.esc(t('search.date', 'Travel date')) + '</label><input id="sf-date" class="input" type="date" min="' + today() + '" value="' + date + '"></div>' +
      '<div class="field"><label for="sf-guests">' + OT.esc(t('svc.guests', 'Guests')) + '</label><select id="sf-guests" class="input">' + [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return '<option' + (n === guests ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div></div>' +
      '<button type="submit" class="btn btn-primary" id="sf-go">' + OT.icon('search', 16) + OT.esc(t('svc.search', 'Search')) + '</button></form>' +
      '<div class="svc-list" id="svc-list">' + (rec.byType[type].length ? cards(rec.byType[type]) : '<p class="muted">' + OT.esc(t('res.none', 'No verified options in this category.')) + '</p>') + '</div></div>';
    OT.trains.bindPicker(el, 'sf-city');
    el.querySelector('#sf-form').addEventListener('submit', function (e) {
      e.preventDefault();
      OT.go((isFood ? 'food?' : 'sights?') + qs({ city: OT.trains.codeOf(el, 'sf-city') || city, date: el.querySelector('#sf-date').value, guests: el.querySelector('#sf-guests').value }));
    });
    function go(x, now) {
      var d = el.querySelector('#sf-date').value || date, g = +el.querySelector('#sf-guests').value || guests;
      var when = d + 'T' + (x.slot || (isFood ? '13:00' : '10:00'));
      book(x, { start: d, end: d, when: when, endWhen: x.durationMin ? OT.agents.time.addMinIso(when, x.durationMin) : undefined, pax: g, standalone: true }, now);
    }
    bindCards(el.querySelector('#svc-list'), function (x) { go(x, true); }, function (x) { go(x, false); });
  }

  function reg(name, icon, key, en, fn) {
    OT.registerView(name, {
      title: function () { return OT.t(key, en); },
      section: name,
      render: function (el, params) { root = el; fn(el, params.query || {}); },
      onLeave: function () { root = null; }
    });
  }
  reg('hotels', 'hotel', 'nav.hotels', 'Hotels', renderHotels);
  reg('transport', 'cab', 'nav.transport', 'Transport', renderTransport);
  reg('food', 'food', 'tabs.food', 'Food', function (el, q) { renderSimple(el, q, 'food'); });
  reg('sights', 'sight', 'tabs.sight', 'Sightseeing', function (el, q) { renderSimple(el, q, 'sight'); });
  OT.services = { placePicker: placePicker, bindPlacePicker: bindPlacePicker, qs: qs };
})();
