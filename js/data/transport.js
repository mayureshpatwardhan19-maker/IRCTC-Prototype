/* IRCTC OneTrip — LOCAL TRANSPORT comparison (v1.2). ALL PRICES AND TIMES ARE SIMULATED AND DETERMINISTIC.
 *
 * For any leg inside a city (station / airport / hotel / landmark), compare side by side:
 *   cab · auto-rickshaw · city bus · metro · e-rickshaw · walk
 * with total + per-person price, travel time, wait/frequency, comfort, luggage, door-to-door, last-mile walk,
 * CO2 estimate and availability at that time. Metro exists only in cities that really have one (list below,
 * real knowledge, Nov 2026); elsewhere the card says so honestly ("No metro in Chandigarh").
 * Each bookable mode (cab, metro, bus) is registered as a catalogue item (type 'cab', mode, leg:true) with a source,
 * providerSource and checkedAt, so the same Verification Agent, checkout, bookings and refunds apply.
 * v1.2.1: auto-rickshaws and shared e-rickshaws run on the meter / are flagged down, so they are NEVER bookable:
 * no catalogue item, no Book button, no cart line, no booking ref. They carry meter:true, an approximate fare
 * ("≈ ₹270 on meter") and a "no booking needed" note. In the journey flow the traveller may mark "I'll take an
 * auto": that is stored in journey.meterRides (see OT.meter), never in journey.items.
 *
 *   OT.data.transport.places(city)                      -> [{id, name, kind, km}]
 *   OT.data.transport.compare({city, from, to, date, time, pax, bags, persona})
 *        -> {city, from, to, km, options:[…], cheapest, fastest, group, metroCity}
 *   OT.data.transport.stationLeg(city, hotelRefId, j)   -> compare() for station → hotel in the journey flow
 */
(function () {
  'use strict';
  var OT = window.OT;
  OT.data = OT.data || {};
  var T = function () { return OT.data.travel; }, R = function () { return OT.data.rail; };

  /* Cities with an operational metro (real systems; sample fares). Value = system name. */
  var METRO = {
    NDLS: 'Delhi Metro', CSMT: 'Mumbai Metro', BCT: 'Mumbai Metro', HWH: 'Kolkata Metro', MAS: 'Chennai Metro', MS: 'Chennai Metro',
    SBC: 'Namma Metro', SC: 'Hyderabad Metro', JP: 'Jaipur Metro', LKO: 'Lucknow Metro', PUNE: 'Pune Metro', ADI: 'Ahmedabad Metro',
    ERS: 'Kochi Metro', NGP: 'Nagpur Metro', AGC: 'Agra Metro', INDB: 'Indore Metro'
  };
  /* Airports near each station: [name, km from the station] (approximate, sample). */
  var AIRPORT = {
    NDLS: ['Indira Gandhi International Airport T3 (DEL)', 16], CDG: ['Chandigarh International Airport (IXC)', 11], CSMT: ['Mumbai CSMIA T2 (BOM)', 22], BCT: ['Mumbai CSMIA T2 (BOM)', 18],
    MAS: ['Chennai International Airport (MAA)', 17], MS: ['Chennai International Airport (MAA)', 16], SBC: ['Kempegowda International Airport (BLR)', 38], SC: ['Rajiv Gandhi International Airport (HYD)', 36],
    HWH: ['Netaji Subhas Chandra Bose International Airport (CCU)', 20], JP: ['Jaipur International Airport (JAI)', 11], LKO: ['Chaudhary Charan Singh Airport (LKO)', 14], PUNE: ['Pune Airport (PNQ)', 10],
    ADI: ['SVPI Airport (AMD)', 10], ERS: ['Cochin International Airport (COK)', 30], NGP: ['Nagpur Airport (NAG)', 9], AGC: ['Agra Airport (AGR)', 8], BSB: ['Varanasi Airport (VNS)', 24],
    ASR: ['Amritsar Airport (ATQ)', 13], GHY: ['Guwahati Airport (GAU)', 24], MAO: ['Goa Dabolim Airport (GOI)', 25], BBS: ['Bhubaneswar Airport (BBI)', 4], PNBE: ['Patna Airport (PAT)', 6],
    TVC: ['Thiruvananthapuram Airport (TRV)', 5], MDU: ['Madurai Airport (IXM)', 12], UDZ: ['Udaipur Airport (UDR)', 22], JU: ['Jodhpur Airport (JDH)', 5], BPL: ['Bhopal Airport (BHO)', 15],
    INDB: ['Indore Airport (IDR)', 8], DDN: ['Dehradun Airport (DED)', 25], PRYJ: ['Prayagraj Airport (IXD)', 12], BZA: ['Vijayawada Airport (VGA)', 19], MYS: ['Mysuru Airport (MYQ)', 10],
    NJP: ['Bagdogra Airport (IXB)', 14], JAT: ['Jammu Airport (IXJ)', 6], SML: ['Shimla Airport (SLV)', 22]
  };
  /* Airports served by a metro line from the city network (sample knowledge; others need a cab/bus). */
  var METRO_AIRPORT = { NDLS: 1, MAS: 1, MS: 1, LKO: 1 };
  var HILLS = { SML: 1, KLK: 1, NJP: 0 };
  var BIG = { NDLS: 1, CSMT: 1, BCT: 1, HWH: 1, MAS: 1, MS: 1, SBC: 1, SC: 1, PUNE: 1, ADI: 1 };

  function hash(s) { return R() ? R().hash(s) : 7; }
  function cityName(code) { var s = T().stations[code]; return s ? (s.city || s.names.en) : code; }
  function r10(n) { return Math.round(n / 10) * 10; }

  /** Places in a city, positioned around the main station (km + deterministic bearing). */
  function places(city) {
    if (T().ensureCity) T().ensureCity(city);
    var st = T().stations[city]; if (!st) return [];
    var out = [{ id: 'stn:' + city, name: T().stationName(city, 'en') + ' railway station (' + city + ')', short: T().stationName(city, 'en') + ' station', kind: 'station', km: 0 }];
    Object.keys(T().stations).forEach(function (c) {
      var s = T().stations[c];
      if (c !== city && s.city && st.city && s.city === st.city && s.lat) out.push({ id: 'stn:' + c, name: s.names.en + ' railway station (' + c + ')', short: s.names.en + ' station', kind: 'station', km: Math.max(1.5, Math.round(R().dist(city, c) * 10) / 10) });
    });
    if (AIRPORT[city]) out.push({ id: 'air:' + city, name: AIRPORT[city][0], short: AIRPORT[city][0].replace(/ \(.*\)$/, ''), kind: 'airport', km: AIRPORT[city][1] });
    T().byCity(city, 'hotel').forEach(function (h) { if (!h.leg) out.push({ id: 'htl:' + h.id, name: h.name, short: h.name, kind: 'hotel', km: h.distanceKm || 2, ref: h.id }); });
    T().byCity(city, 'sight').forEach(function (x) { if (!x.service && !x.leg && x.distanceKm != null) out.push({ id: 'lm:' + x.id, name: x.name, short: x.name, kind: 'landmark', km: x.distanceKm, ref: x.id }); });
    return out;
  }
  function place(city, id) { return places(city).filter(function (p) { return p.id === id; })[0] || null; }
  function pos(p) { var a = (hash(p.id) % 360) * Math.PI / 180; return { x: p.km * Math.cos(a), y: p.km * Math.sin(a) }; }
  function legKm(a, b) {
    if (a.id === b.id) return 0;
    if (a.kind === 'station' && a.km === 0) return Math.max(0.4, Math.round(b.km * 10) / 10);
    if (b.kind === 'station' && b.km === 0) return Math.max(0.4, Math.round(a.km * 10) / 10);
    var p = pos(a), q = pos(b);
    return Math.max(0.4, Math.round(Math.sqrt(Math.pow(p.x - q.x, 2) + Math.pow(p.y - q.y, 2)) * 1.25 * 10) / 10);
  }
  function minOf(hhmm) { var p = String(hhmm || '10:00').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }

  var MODE_DEF = {
    cab: { icon: 'cab', key: 'tx.cab', en: 'Cab (sedan)', src: 'Cab partner quote (simulated)', basis: 'trip', comfort: 5, luggage: 'yes', door: true, co2: 120 },
    auto: { icon: 'auto', key: 'tx.auto', en: 'Auto-rickshaw', src: 'Auto meter tariff card (sample)', basis: 'trip', comfort: 3, luggage: 'some', door: true, co2: 60 },
    bus: { icon: 'bus', key: 'tx.bus', en: 'City bus', src: 'City bus fare chart (sample)', basis: 'person', comfort: 2, luggage: 'no', door: false, co2: 30 },
    metro: { icon: 'metro', key: 'tx.metro', en: 'Metro', src: 'Metro fare table (sample)', basis: 'person', comfort: 4, luggage: 'some', door: false, co2: 25 },
    erick: { icon: 'auto', key: 'tx.erick', en: 'E-rickshaw (shared)', src: 'E-rickshaw stand rate board (sample)', basis: 'person', comfort: 2, luggage: 'some', door: true, co2: 15 },
    walk: { icon: 'walk', key: 'tx.walk', en: 'Walk', src: 'Map distance (simulated)', basis: 'trip', comfort: 2, luggage: 'no', door: true, co2: 0 }
  };
  var ORDER = ['cab', 'auto', 'metro', 'bus', 'erick', 'walk'];

  /** Compare every mode for one leg. */
  function compare(o) {
    o = o || {};
    var city = o.city || 'CDG';
    var all = places(city);
    var a = (typeof o.from === 'string' ? place(city, o.from) : o.from) || all[0];
    var b = (typeof o.to === 'string' ? place(city, o.to) : o.to) || all.filter(function (p) { return p.kind === 'hotel'; })[0] || all[1];
    var km = legKm(a, b), pax = Math.max(1, Math.min(9, +o.pax || 1)), bags = o.bags == null ? pax : +o.bags;
    var time = o.time || '10:00', tmin = minOf(time), night = tmin >= 23 * 60 || tmin < 5 * 60;
    var f = { NDLS: 1.1, CSMT: 1.15, BCT: 1.15, SBC: 1.15, MAO: 1.2, SML: 1.25 }[city] || 1;
    var cn = cityName(city), legKey = city + '|' + a.id + '|' + b.id;
    var options = [];
    ORDER.forEach(function (mode) {
      var d = MODE_DEF[mode], opt = { mode: mode, icon: d.icon, key: d.key, en: d.en, available: true, reason: null, comfort: d.comfort, luggage: d.luggage, door: d.door, walkM: 0, vehicles: 1 };
      if (mode === 'cab') {
        var suv = pax > 4 && pax <= 6, cabs = pax > 6 ? Math.ceil(pax / 4) : 1;
        var fare = Math.max(suv ? 300 : 200, r10((suv ? 140 : 100) + km * (suv ? 22 : 16) * f));
        if (night) fare = r10(fare * 1.25);
        opt.total = fare * cabs; opt.vehicles = cabs; opt.minutes = Math.round(km / 24 * 60) + 4; opt.waitMin = 6; opt.freq = null;
        opt.note = suv ? 'tx.suv' : night ? 'tx.night' : null;
      } else if (mode === 'auto') {
        if (HILLS[city]) { opt.available = false; opt.reason = ['tx.noAutoHills', 'No auto-rickshaws on {city}’s hill roads', { city: cn }]; }
        else if (km > 18) { opt.available = false; opt.reason = ['tx.tooFar', 'Too far for this mode ({km} km)', { km: km }]; }
        var autos = Math.ceil(pax / 3), af = Math.max(30, r10(30 + Math.max(0, km - 1.5) * 15 * f));
        if (night) af = r10(af * 1.5);
        opt.total = af * autos; opt.vehicles = autos; opt.minutes = Math.round(km / 20 * 60) + 3; opt.waitMin = 4; opt.note = night ? 'tx.nightAuto' : null;
      } else if (mode === 'bus') {
        var bf = Math.min(50, Math.max(10, r10(8 + km * 2)));
        var freq = BIG[city] ? 10 : HILLS[city] ? 30 : 20;
        opt.total = bf * pax; opt.perPerson = bf; opt.freq = freq; opt.waitMin = Math.round(freq / 2); opt.walkM = 350 + (hash(legKey) % 5) * 100;
        opt.minutes = Math.round(km / 15 * 60) + Math.round(opt.walkM / 75);
        if (tmin < 6 * 60 || tmin >= 22 * 60) { opt.available = false; opt.reason = ['tx.busHours', 'City buses run 06:00–22:00 (sample timetable)', {}]; }
      } else if (mode === 'metro') {
        if (!METRO[city]) { opt.available = false; opt.noMetro = true; opt.reason = ['tx.noMetro', 'No metro in {city}', { city: cn }]; }
        else if ((a.kind === 'airport' || b.kind === 'airport') && !METRO_AIRPORT[city]) { opt.available = false; opt.reason = ['tx.noMetroAir', 'The {sys} does not reach this airport yet', { sys: METRO[city] }]; }
        else if (km < 2.5) { opt.available = false; opt.reason = ['tx.tooShort', 'Too short a trip for the metro ({km} km)', { km: km }]; }
        else if (tmin < 6 * 60 || tmin >= 23 * 60) { opt.available = false; opt.reason = ['tx.metroHours', '{sys} runs about 06:00–23:00 (sample)', { sys: METRO[city] }]; }
        var mf = Math.min(60, Math.max(10, r10(10 + km * 3)));
        opt.system = METRO[city] || null; opt.total = mf * pax; opt.perPerson = mf; opt.freq = BIG[city] ? 5 : 10; opt.waitMin = Math.round(opt.freq / 2);
        opt.walkM = 500 + (hash(legKey + 'm') % 8) * 100; opt.minutes = Math.round(km / 32 * 60) + Math.round(opt.walkM / 75) + 4;
      } else if (mode === 'erick') {
        if (HILLS[city]) { opt.available = false; opt.reason = ['tx.noErickHills', 'No e-rickshaws on {city}’s hill roads', { city: cn }]; }
        else if (km > 6) { opt.available = false; opt.reason = ['tx.tooFar', 'Too far for this mode ({km} km)', { km: km }]; }
        var ef = km <= 3 ? 20 : r10(20 + (km - 3) * 10);
        opt.total = ef * pax; opt.perPerson = ef; opt.minutes = Math.round(km / 14 * 60) + 2; opt.waitMin = 5;
      } else if (mode === 'walk') {
        opt.total = 0; opt.perPerson = 0; opt.minutes = Math.round(km / 4.5 * 60); opt.waitMin = 0;
        if (km > 2.5) { opt.available = false; opt.reason = ['tx.tooFarWalk', 'Too far to walk with luggage ({km} km)', { km: km }]; }
      }
      if (opt.perPerson == null) opt.perPerson = Math.round(opt.total / pax);
      // CO2 for the whole party, grams: vehicles × g/km for cabs/autos, per person for shared modes
      opt.co2g = Math.round(km * (d.basis === 'trip' && mode !== 'walk' ? d.co2 * opt.vehicles : d.co2 * pax));
      opt.door = d.door;
      opt.km = km;
      if (mode === 'auto' || mode === 'erick') { opt.meter = true; opt.src = d.src; opt.note2 = meterNote(mode, a, cn); }
      else if (opt.available && mode !== 'walk') opt.item = itemFor(city, a, b, mode, opt, legKey, pax);
      options.push(opt);
    });
    var av = options.filter(function (x) { return x.available; });
    var paid = av.filter(function (x) { return x.mode !== 'walk'; });
    var cheapest = paid.slice().sort(function (x, y) { return x.total - y.total || x.minutes - y.minutes; })[0];
    var fastest = av.slice().sort(function (x, y) { return (x.minutes + x.waitMin) - (y.minutes + y.waitMin) || x.total - y.total; })[0];
    var per = o.persona || {};
    var heavy = bags >= 2 || pax >= 3 || per.kind === 'family' || per.kind === 'pilgrim' || (per.prefs && per.prefs.senior);
    var group = paid.slice().sort(function (x, y) { return groupScore(y, heavy, pax) - groupScore(x, heavy, pax); })[0];
    options.forEach(function (x) {
      x.badges = [];
      if (cheapest && x === cheapest) x.badges.push('cheapest');
      if (fastest && x === fastest) x.badges.push('fastest');
      if (group && x === group) x.badges.push('group');
    });
    return { city: city, cityName: cn, from: a, to: b, km: km, pax: pax, bags: bags, time: time, date: o.date, options: options, cheapest: cheapest, fastest: fastest, group: group,
      metroCity: !!METRO[city], heavy: heavy, legKey: legKey };
  }
  function groupScore(x, heavy, pax) {
    var s = 100 - x.total / Math.max(1, pax) * (heavy ? 0.05 : 0.4) - (x.minutes + x.waitMin) * 0.6 + x.comfort * (heavy ? 6 : 2);
    if (heavy && x.door) s += 18;
    if (heavy && x.luggage === 'yes') s += 12;
    if (heavy && x.luggage === 'no') s -= 25;
    s -= x.walkM / 100 * (heavy ? 3 : 0.5);
    return s;
  }

  /** "No booking needed" note for a meter mode: [i18n key, English, vars]. */
  function meterNote(mode, a, cn) {
    var at = a.kind === 'station' ? a.short : null;
    if (mode === 'erick') return at ? ['tx.meterErick', 'No booking needed: flag one down at the e-rickshaw stand outside {place}; pay the driver.', { place: at }]
      : ['tx.meterErickAny', 'No booking needed: flag one down on the road near {place}; pay the driver.', { place: a.short }];
    return at ? ['tx.meterAuto', 'No booking needed: take one from the prepaid auto booth outside {place}; pay the driver.', { place: at }]
      : ['tx.meterAutoAny', 'No booking needed: hail one near {place} or ask your hotel; pay the driver on the meter.', { place: a.short || cn }];
  }

  /* Bookable catalogue item for one (leg, mode), registered once (deterministic id). */
  function itemFor(city, a, b, mode, opt, legKey, pax) {
    var id = 'TR-' + city + '-' + (hash(legKey) % 90000 + 10000) + '-' + mode + (pax > 1 ? '-' + pax : '');
    var ex = T().get(id); if (ex) return ex;
    var d = MODE_DEF[mode];
    var price = d.basis === 'person' ? opt.perPerson : opt.total;
    var x = {
      id: id, type: 'cab', mode: mode, leg: true, legKey: legKey, city: city, partnerId: mode === 'cab' ? 'P-9TX1' : mode === 'auto' ? 'IRCTC-PPA' : mode === 'erick' ? 'P-9TX2' : 'PT-' + city,
      name: d.en + ': ' + a.short + ' → ' + b.short,
      provider: mode === 'metro' ? opt.system + ' (sample fares)' : mode === 'bus' ? cityName(city) + ' city bus (sample)' : mode === 'auto' ? cityName(city) + ' prepaid auto (sample)' : mode === 'erick' ? cityName(city) + ' e-rickshaw stand (sample)' : cityName(city) + ' Cabs (sample)',
      managed: mode === 'auto' ? 'irctc' : 'partner', sponsored: false, price: price, basis: d.basis, rating: null, reviews: 0, durationMin: opt.minutes,
      vehicle: mode === 'cab' ? (pax > 4 && pax <= 6 ? 'SUV · 6 seats · large boot' : 'Sedan · 4 seats · boot space') + (opt.vehicles > 1 ? ' × ' + opt.vehicles : '') : mode === 'auto' ? 'Auto · 3 seats' + (opt.vehicles > 1 ? ' × ' + opt.vehicles : '') : mode === 'metro' ? 'QR ticket per person' : mode === 'bus' ? 'Bus ticket per person' : 'Shared seat per person',
      meet: a.short + ' → ' + b.short, from: a.id, to: b.id, km: opt.km,
      offsetMin: a.kind === 'station' && b.kind === 'hotel' ? 15 + (opt.walkM ? Math.round(opt.walkM / 75) : 0) : undefined,
      availability: 'available', tags: [mode, opt.door ? 'door' : 'transit'].concat(opt.luggage === 'yes' ? ['luggage'] : []),
      policy: { fullUntilH: 1, thenPct: 0 },
      desc: { en: d.en + ' for ' + pax + ' traveller(s), ' + opt.km + ' km, about ' + opt.minutes + ' min. Simulated fare.', hi: pax + ' यात्रियों के लिए, ' + opt.km + ' किमी, लगभग ' + opt.minutes + ' मिनट। सिम्युलेटेड किराया।' },
      source: { name: d.src, ref: 'LOCAL/' + city + '/' + mode + '/' + (hash(legKey) % 9999), checkedMins: 4 + hash(legKey + mode) % 20 },
      providerSource: { name: d.src.replace('(sample)', '(re-check, sample)').replace('(simulated)', '(re-check, simulated)'), price: price, rating: null, ratingNotApplicable: true, availability: 'available', checkedMins: 2 + hash(mode + legKey) % 10 },
      compare: []
    };
    T().addItems([x]);
    // persist the leg so a booked transport item still resolves (basis, policy, source) after a page reload
    try { OT.store.update('txItems', function (m) { m = m || {}; m[id] = x; var k = Object.keys(m); if (k.length > 120) delete m[k[0]]; return m; }); } catch (e) { /* storage optional */ }
    return T().get(id);
  }

  /** Station → hotel leg for the journey flow (party size and time from the journey). */
  function stationLeg(city, hotelRef, j, persona) {
    var hp = hotelRef ? 'htl:' + hotelRef : null;
    var all = places(city);
    if (!hp || !place(city, hp)) { var h = all.filter(function (p) { return p.kind === 'hotel'; })[0]; hp = h ? h.id : all[1] && all[1].id; }
    var tr = j && j.train;
    var t = tr ? OT.agents.time.fromMin(OT.agents.time.toMin(tr.arr) + 15) : '12:00';
    return compare({ city: city, from: 'stn:' + city, to: hp, date: tr ? (tr.arrDate || tr.date) : null, time: t, pax: (j && j.passengers) || 2, persona: persona });
  }

  /** Modes that are never booked online (meter / flag-down). */
  var METER = { auto: 1, erick: 1 };
  function isMeter(x) { return !!(x && (x.meter || METER[x.mode])); }

  OT.data.transport = { simulated: true, METRO: METRO, AIRPORT: AIRPORT, MODES: MODE_DEF, places: places, place: place, compare: compare, stationLeg: stationLeg, legKm: legKm,
    METER: METER, isMeter: isMeter, meterNote: meterNote };
})();
