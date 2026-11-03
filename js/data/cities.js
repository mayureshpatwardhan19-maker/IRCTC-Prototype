/* IRCTC OneTrip — SIMULATED listings for ANY destination (v1.1) + journey builders.
 *
 * The hand-made CDG / MDU / PURI catalogue stays as it is. For every other station, OT.data.travel.ensureCity(code)
 * generates hotels, cabs, food and sights DETERMINISTICALLY (seeded by the station code), with the same
 * source / providerSource / verification rules and some deliberate verification flags:
 *   hotel #2 price changed at source · hotel #3 stale (> 6 h) · hotel #6 sold out · hotel #5 rating missing ·
 *   full-day cab stale. Names are fictional; famous sights are real places with SAMPLE fees.
 *
 *   OT.data.travel.ensureCity(code)                 -> items for that city (registered in the catalogue)
 *   OT.data.travel.journeyFromTicket(ticket, opts)  -> store 'journey' built from a (simulated) train booking
 *   OT.data.travel.plannedJourney(to, opts)         -> journey with a suggested, NOT yet booked train
 */
(function () {
  'use strict';
  var OT = window.OT;
  var T = OT.data.travel, R = OT.data.rail;

  var SIGHTS = {
    CSMT: [['Gateway of India', 0, '10:00', 'heritage family'], ['Marine Drive sunset walk', 0, '18:00', 'family'], ['Chhatrapati Shivaji Maharaj Vastu Sangrahalaya', 150, '11:30', 'heritage']],
    BCT: [['Gateway of India', 0, '10:00', 'heritage family'], ['Marine Drive sunset walk', 0, '18:00', 'family']],
    NDLS: [['Red Fort', 50, '10:00', 'heritage family'], ['Qutub Minar', 50, '15:00', 'heritage'], ['Akshardham (darshan)', 0, '16:30', 'temple family']],
    KLK: [['Kalka–Shimla toy train ride (UNESCO, reserved seat)', 470, '12:10', 'hills family'], ['Pinjore Gardens', 30, '10:30', 'family']],
    SML: [['The Ridge & Mall Road', 0, '16:00', 'hills family'], ['Jakhu Temple', 0, '10:00', 'temple hills'], ['Kufri day trip', 0, '09:30', 'hills family']],
    ASR: [['Golden Temple (Harmandir Sahib)', 0, '05:30', 'temple heritage'], ['Jallianwala Bagh', 0, '11:00', 'heritage'], ['Attari–Wagah border ceremony', 0, '16:00', 'family']],
    JAT: [['Raghunath Temple', 0, '09:00', 'temple'], ['Bahu Fort', 0, '16:00', 'heritage']],
    HW: [['Har Ki Pauri Ganga Aarti', 0, '18:00', 'temple'], ['Mansa Devi Temple ropeway', 140, '10:00', 'temple family'], ['Rishikesh: Laxman Jhula', 0, '15:00', 'temple hills']],
    DDN: [['Robber’s Cave (Guchhupani)', 35, '11:00', 'family'], ['Mussoorie Mall Road', 0, '16:00', 'hills family']],
    AGC: [['Taj Mahal', 50, '06:30', 'heritage family'], ['Agra Fort', 50, '11:00', 'heritage']],
    LKO: [['Bara Imambara', 50, '10:00', 'heritage'], ['Hazratganj food walk', 0, '18:30', 'family']],
    PRYJ: [['Triveni Sangam boat ride', 0, '07:00', 'temple'], ['Anand Bhawan', 70, '11:00', 'heritage']],
    BSB: [['Dashashwamedh Ghat Ganga Aarti', 0, '18:30', 'temple'], ['Kashi Vishwanath darshan', 0, '05:00', 'temple'], ['Sarnath', 25, '11:00', 'heritage temple']],
    PNBE: [['Golghar', 0, '10:00', 'heritage'], ['Bihar Museum', 100, '11:30', 'heritage family']],
    JP: [['Amber Fort', 100, '09:00', 'heritage family'], ['Hawa Mahal', 50, '15:00', 'heritage family'], ['City Palace', 200, '11:30', 'heritage']],
    JU: [['Mehrangarh Fort', 200, '09:30', 'heritage family'], ['Jaswant Thada', 50, '16:00', 'heritage']],
    UDZ: [['City Palace, Udaipur', 300, '10:00', 'heritage family'], ['Lake Pichola boat ride', 400, '17:00', 'family']],
    ADI: [['Sabarmati Ashram', 0, '10:00', 'heritage'], ['Adalaj Stepwell', 0, '16:00', 'heritage']],
    PUNE: [['Shaniwar Wada', 25, '10:00', 'heritage'], ['Aga Khan Palace', 25, '15:00', 'heritage'], ['Lonavala day trip', 0, '08:30', 'hills family']],
    MAO: [['Colva Beach', 0, '16:30', 'beach family'], ['Basilica of Bom Jesus, Old Goa', 0, '10:00', 'heritage'], ['Dudhsagar Falls jeep safari', 600, '08:00', 'family']],
    NGP: [['Deekshabhoomi', 0, '10:00', 'heritage'], ['Futala Lake', 0, '18:00', 'family']],
    BPL: [['Upper Lake (Bada Talab)', 0, '17:00', 'family'], ['Sanchi Stupa day trip', 40, '09:00', 'heritage']],
    INDB: [['Rajwada Palace', 25, '10:00', 'heritage'], ['Sarafa night food market', 0, '21:00', 'family']],
    SBC: [['Lalbagh Botanical Garden', 30, '07:30', 'family'], ['Bangalore Palace', 230, '11:00', 'heritage']],
    MYS: [['Mysuru Palace', 120, '10:00', 'heritage family'], ['Chamundi Hills temple', 0, '07:30', 'temple']],
    MAS: [['Marina Beach', 0, '17:00', 'beach family'], ['Kapaleeshwarar Temple', 0, '07:00', 'temple']],
    MS: [['Marina Beach', 0, '17:00', 'beach family'], ['Government Museum, Egmore', 15, '10:30', 'heritage']],
    TVC: [['Sree Padmanabhaswamy Temple', 0, '05:30', 'temple'], ['Kovalam Beach', 0, '16:30', 'beach family']],
    ERS: [['Fort Kochi Chinese fishing nets', 0, '17:00', 'heritage family'], ['Mattancherry Palace', 5, '10:30', 'heritage']],
    SC: [['Charminar', 25, '10:00', 'heritage family'], ['Golconda Fort', 25, '15:30', 'heritage'], ['Hussain Sagar boat ride', 70, '18:00', 'family']],
    BZA: [['Kanaka Durga Temple', 0, '07:00', 'temple'], ['Undavalli Caves', 25, '15:00', 'heritage']],
    BBS: [['Lingaraj Temple', 0, '07:00', 'temple'], ['Udayagiri & Khandagiri Caves', 25, '15:00', 'heritage']],
    HWH: [['Victoria Memorial', 50, '10:30', 'heritage family'], ['Dakshineswar Kali Temple', 0, '07:30', 'temple']],
    GHY: [['Kamakhya Temple', 0, '06:30', 'temple'], ['Brahmaputra river cruise', 500, '17:00', 'family']],
    NJP: [['Darjeeling toy train joyride (sample)', 1500, '09:30', 'hills family'], ['Mahananda Wildlife Sanctuary', 100, '14:00', 'family']],
    UMB: [['Ambala Cantonment heritage walk', 0, '16:00', 'heritage']]
  };
  var TIER = { NDLS: 1.35, CSMT: 1.4, BCT: 1.4, SBC: 1.3, MAS: 1.2, MS: 1.2, SC: 1.2, HWH: 1.2, PUNE: 1.15, MAO: 1.35, SML: 1.3, JP: 1.15, UDZ: 1.25, AGC: 1.1, ERS: 1.1, GHY: 1.05 };
  var made = {};

  function r50(n) { return Math.round(n / 50) * 50; }
  function cmp(p, a, b) { return [{ name: 'TravelSite A (sample)', price: r50(p * a) }, { name: 'TravelSite B (sample)', price: r50(p * b) }]; }

  function ensureCity(code) {
    // skip only when real listings exist: local-transport legs (x.leg) for the city must not block generating its hotels/food/sights
    if (!code || made[code] || T.byCity(code).some(function (x) { return !x.leg; })) { if (code) made[code] = true; return T.byCity(code); }
    made[code] = true;
    var st = T.stations[code]; if (!st) return [];
    var city = st.city || st.names.en, cityHi = st.names.hi || city;
    var rnd = R.rng('city:' + code), f = TIER[code] || 1, id = function (t, n) { return t + '-' + code + '-' + (n < 10 ? '0' : '') + n; };
    var pid = function (n) { return 'P-9' + (R.hash(code) % 80 + 10) + n; };
    var tagsOf = st.tags || [];
    var items = [];
    var H = [
      ['Station View Residency', 2400, 0.6, '12:00', 4.3, ['nearStation', 'family', 'freeCancel', 'veg'], { fullUntilH: 24, thenPct: 50 }, 'Two minutes from the main exit. Family rooms, veg kitchen.', 'मुख्य निकास से दो मिनट। फैमिली रूम, शाकाहारी रसोई।'],
      ['Hotel ' + city + ' Grand', 3100, 2.8, '14:00', 4.2, ['family', 'freeCancel', 'ac', 'wifi'], { fullUntilH: 48, thenPct: 0 }, 'Central location with breakfast included.', 'केंद्र में, नाश्ता शामिल।'],
      [city + ' Heritage Inn', 2700, 4.1, '13:00', 4.4, ['heritage', 'family', 'freeCancel'], { fullUntilH: 24, thenPct: 0 }, 'Restored old-town property close to the sights.', 'पुराने शहर में, घूमने की जगहों के पास।'],
      ['Rail Yatri Niwas, ' + city + ' (sample)', 1500, 0.3, '12:00', 3.9, ['nearStation', 'budget', 'veg'], { fullUntilH: 24, thenPct: 75 }, 'Basic, clean rooms at the station (IRCTC-managed, sample).', 'स्टेशन पर साधारण, साफ कमरे (IRCTC संचालित, सैंपल)।'],
      ['Backpacker Hostel ' + city + ' (dorm bed)', 650, 1.9, '13:00', 4.1, ['budget', 'hostel'], { fullUntilH: 24, thenPct: 0 }, 'Dorm bed with lockers and Wi-Fi. Popular with students.', 'लॉकर और वाई-फ़ाई के साथ डॉर्म बेड। छात्रों में लोकप्रिय।'],
      ['Comfort Suites ' + city, 4300, 6.5, '14:00', 4.5, ['family', 'pool', 'freeCancel'], { fullUntilH: 24, thenPct: 0 }, 'Larger suites with pool, further from the station.', 'पूल वाले बड़े सुइट, स्टेशन से दूर।'],
      ['Town Square Hotel ' + city, 2200, 3.4, '12:00', 4.0, ['family'], { fullUntilH: 72, thenPct: 0 }, 'Mid-range rooms near the market.', 'बाज़ार के पास मध्यम दाम के कमरे।']
    ];
    H.forEach(function (h, i) {
      var price = i === 4 ? r50(h[1] * (0.9 + f * 0.1)) : r50(h[1] * f * (0.92 + rnd() * 0.16));
      var irctc = i === 3;
      var ps = { name: h[0] + ' booking engine (simulated)', price: price, rating: h[4], availability: 'available', checkedMins: 6 + Math.floor(rnd() * 30) };
      var src = { name: irctc ? 'IRCTC Tourism catalogue (sample)' : 'Partner Hotel API (simulated)', ref: 'PHAPI/' + code + '/' + (i + 1), checkedMins: 10 + Math.floor(rnd() * 40) };
      if (i === 1) ps.price = price + r50(price * 0.09);           // price changed at source
      if (i === 2) { src.checkedMins = 430; ps.checkedMins = 430; } // stale
      if (i === 6) ps.rating = null;                                // rating missing
      if (i === 5) ps.availability = 'soldout';                     // sold out
      items.push({ id: id('H', i + 1), type: 'hotel', city: code, partnerId: irctc ? 'IRCTC-RYN' : pid(i + 1), name: h[0], provider: irctc ? 'IRCTC Tourism (sample)' : h[0], managed: irctc ? 'irctc' : 'partner', sponsored: i === 2,
        price: price, basis: 'night', rating: h[4], reviews: 120 + Math.floor(rnd() * 1800), distanceKm: h[2], area: h[2] + ' km from ' + code,
        checkIn: h[3], checkOut: '11:00', earlyCheckIn: i === 0 ? { fee: r50(450 * f) } : undefined, availability: i === 3 ? 'few' : 'available', left: 1 + Math.floor(rnd() * 6),
        tags: h[5].concat(tagsOf.indexOf('temple') >= 0 && i < 3 ? ['temple'] : []), policy: h[6], desc: { en: h[7], hi: h[8] },
        source: src, providerSource: ps, compare: cmp(price, 1.07 + rnd() * 0.05, 1.03 + rnd() * 0.06) });
    });
    var arrTr = [
      ['cab', 'Station → hotel sedan transfer', city + ' City Cabs (sample)', r50(320 * f), 4.4, { fullUntilH: 1, thenPct: 0 }, { offsetMin: 15, durationMin: 25, vehicle: 'Sedan · 4 seats · boot space', meet: 'Waits at the main exit with a name board' }, 'Tracks your train: pickup moves if it runs late (sample rule).', 'आपकी ट्रेन ट्रैक करता है: देरी पर पिकअप आगे (सैंपल नियम)।'],
      ['cab', 'Prepaid auto-rickshaw (station booth)', code + ' Prepaid Auto Booth (sample)', r50(140 * f) || 120, 3.9, { fullUntilH: 0, thenPct: 0 }, { offsetMin: 10, durationMin: 25, vehicle: 'Auto · 3 seats', meet: 'Prepaid booth outside the main exit', mode: 'auto', meter: true }, 'Fixed fare from the station booth: pay at the booth or to the driver. No online booking (sample).', 'स्टेशन बूथ से तय किराया: बूथ पर या ड्राइवर को भुगतान करें। ऑनलाइन बुकिंग नहीं (सैंपल)।'],
      ['cab', 'Full-day city cab (8 h / 80 km)', city + ' City Cabs (sample)', r50(2000 * f), 4.4, { fullUntilH: 12, thenPct: 50 }, { slot: '09:30', day: 1, durationMin: 480, vehicle: 'Sedan · 4 seats', meet: 'Pickup from your hotel' }, 'The main sights of ' + city + ' in one day.', city + ' की मुख्य जगहें एक दिन में।']
    ];
    arrTr.forEach(function (c, i) {
      var ps = { name: c[2] + ' dispatch (simulated)', price: c[3], rating: c[4], availability: 'available', checkedMins: 5 + i * 6 };
      var src = { name: i === 1 ? 'Station facilities list (sample)' : 'Cab partner feed (simulated)', ref: 'CABS/' + code + '/' + (i + 1), checkedMins: 8 + i * 9 };
      if (i === 2) { src.checkedMins = 400; ps.checkedMins = 400; }
      items.push(Object.assign({ id: id('C', i + 1), type: 'cab', city: code, partnerId: i === 1 ? 'IRCTC-PPA' : pid(7), name: c[1], provider: c[2], managed: i === 1 ? 'irctc' : 'partner', sponsored: false,
        price: c[3], basis: 'trip', rating: c[4], reviews: 200 + Math.floor(rnd() * 2000), availability: 'available', tags: i === 0 ? ['luggage', 'nearStation', 'freeCancel'] : i === 1 ? ['budget', 'nearStation'] : ['sightseeing'],
        policy: c[5], desc: { en: c[7], hi: c[8] }, source: src, providerSource: ps, compare: cmp(c[3], 1.15, 1.1) }, c[6]));
    });
    [['Local veg thali near the station', r50(260 * f), '13:00', 1.2, ['veg', 'family'], 'Unlimited thali, quick service.', 'असीमित थाली, जल्दी सेवा।'],
      ['Family dinner (veg & non-veg)', r50(480 * f), '20:00', 2.5, ['family'], 'Table reservation for dinner near your hotel.', 'होटल के पास रात के खाने की टेबल बुकिंग।']].forEach(function (x, i) {
      items.push({ id: id('F', i + 1), type: 'food', city: code, partnerId: pid(8 + i), name: x[0], provider: (i ? city + ' Dining' : 'Station Rasoi') + ' (sample)', managed: 'partner', sponsored: false,
        price: x[1], basis: 'person', rating: 4.2 + i * 0.1, reviews: 300 + Math.floor(rnd() * 900), onTrain: false, slot: x[2], distanceKm: x[3], availability: 'available', tags: x[4],
        policy: { fullUntilH: 2, thenPct: 0 }, desc: { en: x[5], hi: x[6] },
        source: { name: 'Restaurant partner feed (simulated)', ref: 'FOOD/' + code + '/' + (i + 1), checkedMins: 20 + i * 11 },
        providerSource: { name: 'Restaurant POS (simulated)', price: x[1], rating: 4.2 + i * 0.1, availability: 'available', checkedMins: 14 + i * 9 }, compare: cmp(x[1], 1.1, 1.08) });
    });
    var sl = SIGHTS[code] || [[city + ' heritage walk (guided, sample)', 400, '09:00', 'heritage'], [city + ' local market walk', 0, '17:00', 'family']];
    sl.forEach(function (s, i) {
      items.push({ id: id('S', i + 1), type: 'sight', city: code, partnerId: 'TOUR-' + code, name: s[0], provider: 'Tourism listing (sample)', managed: 'partner', sponsored: false,
        price: s[1], basis: 'person', rating: 4.4 + (i % 3) * 0.1, reviews: 2000 + Math.floor(rnd() * 40000), slot: s[2], day: i === 0 ? 0 : 1, durationMin: 120, distanceKm: Math.round((2 + rnd() * 8) * 10) / 10,
        availability: 'available', tags: s[3].split(' ').concat(i === 0 ? ['gapFill'] : []), policy: { fullUntilH: 0, thenPct: 0 },
        desc: { en: 'Entry fee as listed by the source (sample); verify at the counter.', hi: 'प्रवेश शुल्क स्रोत के अनुसार (सैंपल); काउंटर पर जाँचें।' },
        source: { name: 'Tourism listing (sample)', ref: 'TOUR/' + code + '/' + (i + 1), checkedMins: 60 + i * 20 },
        providerSource: { name: 'Ticket counter board (sample)', price: s[1], rating: 4.4 + (i % 3) * 0.1, availability: 'available', checkedMins: 55 + i * 20 }, compare: [] });
    });
    items.push({ id: id('S', 9), type: 'sight', city: code, partnerId: 'IRCTC-CLK', name: 'Station cloakroom (luggage, per bag/day)', provider: 'Indian Railways cloakroom, ' + code + ' (sample)', managed: 'irctc', sponsored: false, service: 'cloakroom',
      price: 30, basis: 'bag', rating: null, reviews: 0, slot: '11:15', durationMin: 0, distanceKm: 0, availability: 'available', tags: ['gapFill', 'nearStation'], policy: { fullUntilH: 0, thenPct: 100 },
      desc: { en: 'Leave bags at the station, explore, collect them before check-in (sample tariff).', hi: 'सामान स्टेशन पर रखें, घूमें, चेक-इन से पहले ले लें (सैंपल दर)।' },
      source: { name: 'Station facilities list (sample)', ref: 'STN/' + code + '/cloakroom', checkedMins: 60 },
      providerSource: { name: 'Cloakroom tariff board (sample)', price: 30, rating: null, availability: 'available', checkedMins: 60, ratingNotApplicable: true }, compare: [] });
    T.addItems(items);
    return T.byCity(code);
  }

  /* ---------------- journey builders ---------------- */
  function seatsFrom(tk) { return (tk.passengers || []).map(function (p) { return p.berth ? String(p.berth) : p.status; }); }
  function returnFor(to, from, date, nights, cls) {
    var rd = T.addDays(date, nights || 2);
    var r = R.best(to, from, rd, cls);
    if (!r) return null;
    return { no: r.no, name: r.name, from: r.from, to: r.to, date: rd, dep: r.dep, arr: r.arr, pnr: String(4000000000 + R.hash(r.no + rd) % 999999999), cls: r.cls.indexOf(cls) >= 0 ? cls : r.cls[0] };
  }
  function journeyFromTicket(tk, opts) {
    opts = opts || {};
    ensureCity(tk.to);
    var u = OT.store.get('user') || {};
    var nights = opts.nights || 2;
    var cnf = (tk.passengers || []).filter(function (p) { return p.coach; })[0];
    return {
      id: OT.uid('JRN'), scenario: tk.to, pnr: tk.pnr, simulated: true, bookedViaOneTrip: true, ticketRef: tk.ref || null,
      train: { no: tk.no, name: tk.name, from: tk.from, fromName: tk.fromName, to: tk.to, toName: tk.toName, date: tk.date, dep: tk.dep, arr: tk.arr, arrDate: tk.arrDate,
        cls: tk.cls, coach: cnf ? cnf.coach : '—', seats: seatsFrom(tk), status: tk.status, fare: tk.total, chance: tk.chance },
      returnTrain: null, returnOption: returnFor(tk.to, tk.from, tk.arrDate, nights, tk.cls),
      passengers: (tk.passengers || []).length || 1, budget: opts.budget || (u.budget) || 3000, nights: nights,
      prefs: opts.prefs || (u.prefs ? JSON.parse(JSON.stringify(u.prefs)) : { nearStation: true }), items: [], createdAt: new Date().toISOString()
    };
  }
  /** A destination without a booked train: suggest the best simulated train (status PLANNED, not booked). */
  function plannedJourney(to, opts) {
    opts = opts || {};
    ensureCity(to);
    var u = OT.store.get('user') || {};
    var from = opts.from || u.homeCity || 'NDLS';
    if (from === to) from = to === 'NDLS' ? 'CSMT' : 'NDLS';
    var date = opts.date || T.defaultDate();
    var tr = R.best(from, to, date) || R.best('NDLS', to, date);
    var pax = opts.passengers || (u.party ? u.party.length : 2);
    var cls = tr ? tr.cls[0] : '3A';
    var c = tr ? tr.classes.filter(function (x) { return x.cls === cls; })[0] : null;
    return {
      id: OT.uid('JRN'), scenario: to, pnr: null, simulated: true, planned: true,
      train: tr ? { no: tr.no, name: tr.name, from: tr.from, fromName: T.stationName(tr.from, 'en'), to: tr.to, toName: T.stationName(tr.to, 'en'), date: tr.date, dep: tr.dep, arr: tr.arr,
        arrDate: T.addDays(tr.date, tr.arrOffset), cls: cls, coach: '—', seats: [], status: 'PLANNED', fare: c ? c.fare.total * pax : 0 } : null,
      returnTrain: null, returnOption: tr ? returnFor(to, tr.from, T.addDays(tr.date, tr.arrOffset), 2, cls) : null,
      passengers: pax, budget: opts.budget || u.budget || 3000, nights: 2, prefs: opts.prefs || (u.prefs ? JSON.parse(JSON.stringify(u.prefs)) : { nearStation: true }),
      items: [], createdAt: new Date().toISOString()
    };
  }

  T.ensureCity = ensureCity;
  T.journeyFromTicket = journeyFromTicket;
  T.plannedJourney = plannedJourney;
  T.sightsTable = SIGHTS;
})();
