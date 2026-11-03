/* IRCTC OneTrip — demo personas + "For you" demand data (v1.1). ALL SIMULATED.
 *
 *   OT.data.personas            traveller personas (docs/research/02_business_case.md §2) + partner + admin
 *   OT.data.demand.holidays()   sample holiday calendar (verify with the official gazette)
 *   OT.data.demand.longWeekends(fromDate, n)  -> upcoming long weekends, weekdays computed with Date
 *   OT.data.demand.trends(home, lw, persona)  -> aggregated, anonymised route demand from the home city
 *   OT.data.demand.pkg(persona, trend, lw)    -> train + hotel + cab + sight bundle priced from the catalogue
 *   OT.data.demand.pressure(date)             -> 0..1 seat pressure used by rail availability
 */
(function () {
  'use strict';
  var OT = window.OT;
  OT.data = OT.data || {};
  var R = function () { return OT.data.rail; }, T = function () { return OT.data.travel; };

  var personas = [
    { id: 'sunita', role: 'traveller', waSample: '7589802655', name: 'Sunita Sharma', short: 'Sunita', email: 'sunita.sharma@demo.onetrip', phone: '+91 75898 02655', lang: 'hi', homeCity: 'NDLS',
      segKey: 'persona.sunita.seg', seg: 'Family traveller · Hindi', trips: 'Delhi ↔ Chandigarh / Shimla, Jaipur, Haridwar', cls: 'CC', budget: 3000, kind: 'family',
      prefs: { veg: true, family: true, nearStation: true, freeCancel: true },
      party: [{ name: 'Sunita Sharma', age: 42, gender: 'F', pref: 'W' }, { name: 'Rajesh Sharma', age: 45, gender: 'M', pref: 'A' }, { name: 'Diya Sharma', age: 11, gender: 'F', pref: 'W' }],
      consents: { personalised: true }, history: [['NDLS', 'CDG', '2026-03-14', '12011', 'CC', 2745], ['NDLS', 'JP', '2025-10-03', '12985', 'CC', 2460], ['NDLS', 'HW', '2025-06-07', '12017', 'CC', 2205]] },
    { id: 'ramesh', role: 'traveller', waSample: '7589802655', name: 'Ramesh Iyer', short: 'Ramesh', email: 'ramesh.iyer@demo.onetrip', phone: '+91 75898 02655', lang: 'ta', homeCity: 'MAS',
      segKey: 'persona.ramesh.seg', seg: 'Once-a-year pilgrim with elderly parents · Tamil', trips: 'Chennai → Madurai, Varanasi, Tirupati', cls: '3A', budget: 2000, kind: 'pilgrim',
      prefs: { veg: true, temple: true, nearStation: true, senior: true },
      party: [{ name: 'Ramesh Iyer', age: 48, gender: 'M', pref: 'UB' }, { name: 'Lakshmi Iyer', age: 74, gender: 'F', pref: 'LB' }, { name: 'Venkatesh Iyer', age: 78, gender: 'M', pref: 'LB' }],
      consents: { personalised: true }, history: [['MS', 'MDU', '2026-01-14', '12637', '3A', 3315], ['MAS', 'BSB', '2025-11-02', '12669', '3A', 7650]] },
    { id: 'arjun', role: 'traveller', waSample: '7589802655', name: 'Arjun Deshmukh', short: 'Arjun', email: 'arjun.d@demo.onetrip', phone: '+91 75898 02655', lang: 'mr', homeCity: 'PUNE',
      segKey: 'persona.arjun.seg', seg: 'Student · Pune → home (Nagpur) a few times a year · Marathi', trips: 'Pune ↔ Nagpur, weekend trips to Goa', cls: 'SL', budget: 1200, kind: 'student',
      prefs: { budget: true, hostel: true }, party: [{ name: 'Arjun Deshmukh', age: 21, gender: 'M', pref: 'UB' }],
      consents: { personalised: true }, history: [['PUNE', 'NGP', '2026-08-28', '12135', 'SL', 545], ['PUNE', 'MAO', '2026-02-20', '22149', 'SL', 395]] },
    { id: 'neha', role: 'traveller', waSample: '7589802655', name: 'Neha Kulkarni', short: 'Neha', email: 'neha.k@demo.onetrip', phone: '+91 75898 02655', lang: 'en', homeCity: 'CSMT',
      segKey: 'persona.neha.seg', seg: 'Frequent business traveller · English', trips: 'Mumbai ↔ Pune, Ahmedabad, Bengaluru', cls: 'CC', budget: 5000, kind: 'business',
      prefs: { nearStation: true, freeCancel: true, quick: true }, party: [{ name: 'Neha Kulkarni', age: 34, gender: 'F', pref: 'W' }],
      consents: { personalised: false }, history: [['CSMT', 'PUNE', '2026-10-12', '12123', 'CC', 520], ['BCT', 'ADI', '2026-09-03', '12009', 'CC', 1180], ['CSMT', 'SBC', '2026-07-21', '11301', '2A', 2690]] },
    { id: 'partner', role: 'partner', name: 'Rajinder Singh', short: 'Rajinder', email: 'p101.shivalik@demo.onetrip', phone: '+91 75898 02655', lang: 'en', partnerId: 'P-101', org: 'Hotel Shivalik View',
      segKey: 'persona.partner.seg', seg: 'Tourism partner · Hotel Shivalik View (P-101), Chandigarh' },
    { id: 'admin', role: 'admin', name: 'Ananya Rao', short: 'Ananya', email: 'admin@demo.onetrip', phone: '+91 75898 02655', lang: 'en', org: 'IRCTC OneTrip Admin · Partner Bank (sample)',
      segKey: 'persona.admin.seg', seg: 'IRCTC operations & Partner Bank analyst' }
  ];
  function byId(id) { return personas.filter(function (p) { return p.id === id; })[0] || null; }

  /* ---------------- holiday calendar (SAMPLE) ---------------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function add(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  var MOVABLE = [ // lunar / church calendar dates: sample values, verify with the official gazette
    ['2026-11-24', 'Guru Nanak Jayanti', 'गुरु नानक जयंती'],
    ['2027-03-22', 'Holi (sample date)', 'होली (सैंपल तारीख)'],
    ['2027-03-26', 'Good Friday', 'गुड फ्राइडे'],
    ['2027-11-14', 'Guru Nanak Jayanti (sample date)', 'गुरु नानक जयंती (सैंपल तारीख)']
  ];
  var FIXED = [['01-26', 'Republic Day', 'गणतंत्र दिवस'], ['08-15', 'Independence Day', 'स्वतंत्रता दिवस'], ['10-02', 'Gandhi Jayanti', 'गांधी जयंती'], ['12-25', 'Christmas', 'क्रिसमस']];
  function holidays(today) {
    today = today || new Date();
    var y = today.getFullYear(), out = [];
    [y, y + 1].forEach(function (yy) { FIXED.forEach(function (f) { out.push({ date: yy + '-' + f[0], name: f[1], hi: f[2], fixed: true }); }); });
    MOVABLE.forEach(function (m) { out.push({ date: m[0], name: m[1], hi: m[2], fixed: false }); });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  /** Long weekends: Fri/Mon holiday -> 3 days; Tue/Thu holiday -> 4 days with one leave day. */
  function longWeekends(from, n) {
    var today = from ? parse(from) : new Date(); today.setHours(0, 0, 0, 0);
    var t0 = ymd(today);
    var out = [];
    holidays(today).forEach(function (h) {
      if (h.date <= t0) return;
      var w = parse(h.date).getDay(), start, end, leave = null;
      if (w === 5) { start = h.date; end = add(h.date, 2); }
      else if (w === 1) { start = add(h.date, -2); end = h.date; }
      else if (w === 2) { start = add(h.date, -3); end = h.date; leave = add(h.date, -1); }
      else if (w === 4) { start = h.date; end = add(h.date, 3); leave = add(h.date, 1); }
      else return;
      if (add(start, -1) < t0) return; // the travel date (evening before) has already passed
      var days = Math.round((parse(end) - parse(start)) / 86400000) + 1;
      out.push({ holiday: h, weekday: WD[w], start: start, end: end, days: days, leave: leave, travelDate: add(start, -1), returnDate: end,
        daysAway: Math.round((parse(start) - today) / 86400000) });
    });
    return out.slice(0, n || 3);
  }
  /** Seat pressure for rail availability: high on the eve/first day of a long weekend. */
  function pressure(dateStr) {
    var p = 0;
    longWeekends(null, 6).forEach(function (lw) {
      if (dateStr === lw.travelDate || dateStr === lw.start) p = Math.max(p, 0.55);
      else if (dateStr > lw.start && dateStr <= lw.end) p = Math.max(p, 0.25);
    });
    return p;
  }

  /* ---------------- trending routes (aggregated, anonymised, SIMULATED) ---------------- */
  // [to, label, base bookings on a normal weekend, tags, nights]
  var TREND = {
    NDLS: [['CDG', 'Chandigarh + Kasauli', 980, 'family hills', 2], ['KLK', 'Shimla via Kalka toy train', 520, 'hills family', 2], ['JP', 'Jaipur', 760, 'heritage family', 2],
      ['HW', 'Haridwar & Rishikesh', 690, 'temple', 2], ['ASR', 'Amritsar', 455, 'temple heritage', 1], ['AGC', 'Agra', 380, 'heritage', 1]],
    CDG: [['KLK', 'Shimla via Kalka toy train', 410, 'hills family', 2], ['ASR', 'Amritsar', 520, 'temple heritage', 1], ['HW', 'Haridwar', 300, 'temple', 2], ['JP', 'Jaipur', 210, 'heritage family', 2], ['JAT', 'Jammu (Vaishno Devi)', 360, 'temple', 2]],
    MAS: [['MDU', 'Madurai (Meenakshi temple)', 580, 'temple family', 1], ['BSB', 'Varanasi (Kashi)', 240, 'temple', 3], ['MYS', 'Mysuru', 330, 'heritage family', 2], ['TVC', 'Thiruvananthapuram', 290, 'temple beach', 2], ['ERS', 'Kochi', 350, 'beach family', 2]],
    PUNE: [['MAO', 'Goa', 690, 'beach budget', 2], ['NGP', 'Nagpur (home)', 410, 'budget', 2], ['CSMT', 'Mumbai', 520, 'city budget', 1], ['SBC', 'Bengaluru', 260, 'city', 2]],
    CSMT: [['PUNE', 'Pune (quick trip)', 880, 'city quick', 1], ['MAO', 'Goa', 740, 'beach family', 2], ['ADI', 'Ahmedabad', 410, 'city quick', 1], ['SBC', 'Bengaluru', 300, 'city quick', 1]]
  };
  function genericTrend(home) {
    var all = R().list().filter(function (s) { var d = R().dist(home, s.code); return s.code !== home && d > 120 && d < 900; });
    var r = R().rng('trend:' + home);
    return all.sort(function () { return r() - 0.5; }).slice(0, 4).map(function (s) { return [s.code, s.city || s.names.en, 200 + Math.floor(r() * 400), s.tags.join(' '), 2]; });
  }
  var FIT = { family: ['family', 'hills', 'heritage'], pilgrim: ['temple'], student: ['budget', 'beach', 'city'], business: ['quick', 'city'] };
  function trends(home, lw, persona) {
    var base = TREND[home] || genericTrend(home);
    var fit = persona ? FIT[persona.kind] || [] : [];
    var out = base.map(function (b) {
      var r = R().rng('tr:' + home + b[0] + lw.start);
      var mult = 1.8 + r() * 1.6 + (lw.days >= 4 ? 0.4 : 0);
      var bookings = Math.round(b[2] * mult / 10) * 10;
      var tags = b[3].split(' ');
      var match = tags.filter(function (t) { return fit.indexOf(t) >= 0; }).length;
      return { to: b[0], label: b[1], bookings: bookings, normal: b[2], change: Math.round((mult - 1) * 100), fillsEarly: 4 + Math.floor(r() * 10) + (lw.days >= 4 ? 3 : 0),
        tags: tags, nights: lw.days, fit: match, km: R().dist(home, b[0]), anonymised: true };
    });
    return out.sort(function (a, b) { return (b.fit - a.fit) || (b.bookings - a.bookings); });
  }

  /* ---------------- packages (prices only from the catalogue + simulated timetable) ---------------- */
  var CLS_FOR = { family: ['CC', '3A', '2A'], pilgrim: ['3A', 'SL'], student: ['SL', '3E', 'CC'], business: ['CC', 'EC', '2A'] };
  function pkg(persona, tr, lw) {
    var home = persona.homeCity, to = tr.to;
    T().ensureCity(to);
    var pax = persona.party ? persona.party.length : 2;
    var date = lw.travelDate, list = R().search(home, to, date).filter(function (t) { return t.runs; });
    var pref = CLS_FOR[persona.kind] || ['3A'];
    var train = null, cls = null;
    var SC = { AVAILABLE: 0, RAC: 1, WL: 2, REGRET: 9, DEPARTED: 9 };
    var opts = [];
    list.forEach(function (t) { t.classes.forEach(function (c) {
      var pi = pref.indexOf(c.cls); if (pi < 0) return;
      opts.push({ t: t, cls: c.cls, s: SC[c.avail.state] * 10 + pi * 3 + (t.no === '12011' ? -5 : 0) + t.dur / 600 });
    }); });
    opts.sort(function (a, b) { return a.s - b.s; });
    if (opts.length) { train = opts[0].t; cls = opts[0].cls; }
    if (!train && list.length) { train = list[0]; cls = train.cls[0]; }
    if (!train) return null;
    var c = train.classes.filter(function (x) { return x.cls === cls; })[0];
    var items = T().byCity(to);
    var budget = persona.budget || 3000;
    var verdict = function (x) { return OT.agents && OT.agents.verifyOne ? OT.agents.verifyOne(x).verdict : 'verified'; };
    var hotels = items.filter(function (x) { return x.type === 'hotel' && x.price <= budget && verdict(x) === 'verified'; });
    if (persona.kind === 'student') hotels = hotels.sort(function (a, b) { return a.price - b.price; });
    else hotels = hotels.sort(function (a, b) { return (a.id === 'H-CDG-01' ? -1 : 0) - (b.id === 'H-CDG-01' ? -1 : 0) || (b.rating - a.rating); });
    var hotel = hotels[0] || null;
    var cab = items.filter(function (x) { return x.type === 'cab' && !x.leg && x.offsetMin != null && verdict(x) === 'verified'; })[0] || null;
    var sights = items.filter(function (x) { return x.type === 'sight' && !x.service && verdict(x) === 'verified' && !(x.tags.indexOf('gapFill') >= 0 && x.city === 'CDG'); });
    if (persona.kind === 'pilgrim') sights.sort(function (a, b) { return (b.tags.indexOf('temple') >= 0) - (a.tags.indexOf('temple') >= 0); });
    var sight = sights[0] || null;
    // the stay must cover arrival -> the last day of the long weekend (travel is the evening before it starts)
    var arrDate = T().addDays(date, train.arrOffset || 0);
    var nights = Math.max(1, Math.round((parse(lw.end) - parse(arrDate)) / 86400000));
    var rooms = Math.max(1, Math.ceil(pax / 3));
    var lines = [{ kind: 'train', label: train.no + ' ' + train.name + ' · ' + cls, amount: c.fare.total * pax, compare: c.fare.total * pax }];
    if (hotel) lines.push({ kind: 'hotel', ref: hotel.id, label: hotel.name, amount: hotel.price * nights * rooms, compare: (hotel.compare && hotel.compare.length ? Math.min.apply(null, hotel.compare.map(function (x) { return x.price; })) : hotel.price) * nights * rooms });
    if (cab) lines.push({ kind: 'cab', ref: cab.id, label: cab.name, amount: cab.price, compare: cab.compare && cab.compare.length ? Math.min.apply(null, cab.compare.map(function (x) { return x.price; })) : cab.price });
    if (sight) lines.push({ kind: 'sight', ref: sight.id, label: sight.name, amount: sight.price * pax, compare: sight.price * pax });
    var total = lines.reduce(function (s, l) { return s + l.amount; }, 0);
    var separate = lines.reduce(function (s, l) { return s + l.compare; }, 0);
    return { to: to, from: home, date: date, returnDate: lw.end, nights: nights, pax: pax, cls: cls, train: train, fare: c.fare.total, avail: c.avail,
      hotel: hotel, cab: cab, sight: sight, lines: lines, total: total, separate: separate, savings: Math.max(0, separate - total), simulated: true };
  }

  OT.data.personas = { list: personas, get: byId, travellers: function () { return personas.filter(function (p) { return p.role === 'traveller'; }); } };
  OT.data.demand = { holidays: holidays, longWeekends: longWeekends, pressure: pressure, trends: trends, pkg: pkg, simulated: true,
    sourceNote: 'Sample holiday calendar — verify with the official gazette. Route demand is simulated, aggregated and anonymised (cohorts < 50 suppressed).' };
})();
