/* IRCTC OneTrip — SIMULATED rail layer (v1.1): station master, deterministic timetable for ANY station
 * pair, class-wise fares, availability (AVAILABLE / RAC / WL / REGRET), PNR + e-ticket, railway-style refunds.
 *
 * Nothing here is live. A handful of real train numbers/names are used where the route is well known
 * (e.g. 12011 Kalka Shatabdi, 12952 Mumbai Rajdhani); their timings are illustrative. Every other train is
 * generated from a seed (station pair), so the same search always shows the same trains.
 * Final booking happens on IRCTC — this prototype only simulates it.
 *
 *   OT.data.rail.stations / list() / find(text, lang) / cityCode(text) / dist(a,b)
 *   OT.data.rail.search(from, to, date)        -> [train]  (with .classes[{cls, fare, avail}], verification)
 *   OT.data.rail.train(no, from, to, date)     -> one train from a search
 *   OT.data.rail.fare(train, cls) / avail(train, cls, date) / chance(avail, date)
 *   OT.data.rail.book({...})                   -> ticket {pnr, passengers[{status, coach, berth}], total, ...}
 *   OT.data.rail.refund(ticket, nowMs)          -> {amount, charge, rule}
 */
(function () {
  'use strict';
  var OT = window.OT;
  var T = OT.data.travel;

  /* ---------------- helpers ---------------- */
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var x = hash(seed) || 1; return function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return (x % 100000) / 100000; }; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function toMin(s) { var p = String(s).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function parseYmd(s) { var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function round5(n) { return Math.round(n / 5) * 5; }

  /* ---------------- Devanagari -> other Indic scripts (for MATCHING ONLY, never displayed) ---------------- */
  var BASES = { bn: 0x0980, pa: 0x0A00, gu: 0x0A80, or: 0x0B00, ta: 0x0B80, te: 0x0C00, kn: 0x0C80, ml: 0x0D00 };
  var TA_FIX = { 'ख': 'க', 'ग': 'க', 'घ': 'க', 'छ': 'ச', 'झ': 'ஜ', 'ठ': 'ட', 'ड': 'ட', 'ढ': 'ட', 'थ': 'த', 'द': 'த', 'ध': 'த', 'फ': 'ப', 'ब': 'ப', 'भ': 'ப', 'श': 'ஶ', 'ं': 'ம்', 'ँ': 'ம்', 'ः': '', '़': '', 'ॉ': 'ா' };
  function translit(deva, lang) {
    var base = BASES[lang]; if (!base) return null;
    var out = '';
    for (var i = 0; i < deva.length; i++) {
      var ch = deva.charAt(i), c = deva.charCodeAt(i);
      if (lang === 'ta' && TA_FIX[ch] != null) { out += TA_FIX[ch]; continue; }
      if (c >= 0x0900 && c <= 0x097F) { out += String.fromCharCode(base + (c - 0x0900)); continue; }
      out += ch;
    }
    return out;
  }

  /* ---------------- Station master ----------------
   * [code, English, Hindi, lat, lon, zone, tags, aliases(latin), {hand-written names in other scripts}] */
  var CITY = {
    mumbai: { bn: 'মুম্বাই', mr: 'मुंबई', ta: 'மும்பை', te: 'ముంబై', kn: 'ಮುಂಬೈ', ml: 'മുംബൈ', gu: 'મુંબઈ', pa: 'ਮੁੰਬਈ', or: 'ମୁମ୍ବାଇ' },
    chennai: { bn: 'চেন্নাই', mr: 'चेन्नई', ta: 'சென்னை', te: 'చెన్నై', kn: 'ಚೆನ್ನೈ', ml: 'ചെന്നൈ', gu: 'ચેન્નઈ', pa: 'ਚੇਨਈ', or: 'ଚେନ୍ନାଇ' },
    bengaluru: { bn: 'বেঙ্গালুরু', mr: 'बंगळुरू', ta: 'பெங்களூரு', te: 'బెంగళూరు', kn: 'ಬೆಂಗಳೂರು', ml: 'ബെംഗളൂരു', gu: 'બેંગલુરુ', pa: 'ਬੈਂਗਲੁਰੂ', or: 'ବେଙ୍ଗାଲୁରୁ' },
    hyderabad: { bn: 'হায়দরাবাদ', mr: 'हैदराबाद', ta: 'ஹைதராபாத்', te: 'హైదరాబాద్', kn: 'ಹೈದರಾಬಾದ್', ml: 'ഹൈദരാബാദ്', gu: 'હૈદરાબાદ', pa: 'ਹੈਦਰਾਬਾਦ', or: 'ହାଇଦ୍ରାବାଦ' },
    pune: { bn: 'পুনে', mr: 'पुणे', ta: 'புனே', te: 'పుణె', kn: 'ಪುಣೆ', ml: 'പൂനെ', gu: 'પુણે', pa: 'ਪੁਣੇ', or: 'ପୁଣେ' },
    jaipur: { bn: 'জয়পুর', mr: 'जयपूर', ta: 'ஜெய்ப்பூர்', te: 'జైపూర్', kn: 'ಜೈಪುರ', ml: 'ജയ്പൂർ', gu: 'જયપુર', pa: 'ਜੈਪੁਰ', or: 'ଜୟପୁର' },
    varanasi: { bn: 'বারাণসী', mr: 'वाराणसी', ta: 'வாரணாசி', te: 'వారణాసి', kn: 'ವಾರಾಣಸಿ', ml: 'വാരാണസി', gu: 'વારાણસી', pa: 'ਵਾਰਾਣਸੀ', or: 'ବାରାଣସୀ' },
    goa: { bn: 'গোয়া', mr: 'गोवा', ta: 'கோவா', te: 'గోవా', kn: 'ಗೋವಾ', ml: 'ഗോവ', gu: 'ગોવા', pa: 'ਗੋਆ', or: 'ଗୋଆ' },
    amritsar: { bn: 'অমৃতসর', mr: 'अमृतसर', ta: 'அமிர்தசரஸ்', te: 'అమృత్‌సర్', kn: 'ಅಮೃತಸರ', ml: 'അമൃത്സർ', gu: 'અમૃતસર', pa: 'ਅੰਮ੍ਰਿਤਸਰ', or: 'ଅମୃତସର' },
    shimla: { bn: 'শিমলা', mr: 'शिमला', ta: 'சிம்லா', te: 'సిమ్లా', kn: 'ಶಿಮ್ಲಾ', ml: 'ഷിംല', gu: 'શિમલા', pa: 'ਸ਼ਿਮਲਾ', or: 'ଶିମଲା' },
    agra: { bn: 'আগ্রা', mr: 'आग्रा', ta: 'ஆக்ரா', te: 'ఆగ్రా', kn: 'ಆಗ್ರಾ', ml: 'ആഗ്ര', gu: 'આગ્રા', pa: 'ਆਗਰਾ', or: 'ଆଗ୍ରା' },
    ahmedabad: { bn: 'আহমেদাবাদ', mr: 'अहमदाबाद', ta: 'அகமதாபாத்', te: 'అహ్మదాబాద్', kn: 'ಅಹಮದಾಬಾದ್', ml: 'അഹമ്മദാബാദ്', gu: 'અમદાવાદ', pa: 'ਅਹਿਮਦਾਬਾਦ', or: 'ଅହମଦାବାଦ' },
    lucknow: { bn: 'লখনউ', mr: 'लखनौ', ta: 'லக்னோ', te: 'లక్నో', kn: 'ಲಕ್ನೋ', ml: 'ലഖ്‌നൗ', gu: 'લખનૌ', pa: 'ਲਖਨਊ', or: 'ଲକ୍ଷ୍ନୌ' },
    patna: { bn: 'পাটনা', mr: 'पाटणा', ta: 'பாட்னா', te: 'పాట్నా', kn: 'ಪಾಟ್ನಾ', ml: 'പട്ന', gu: 'પટના', pa: 'ਪਟਨਾ', or: 'ପାଟନା' },
    guwahati: { bn: 'গুয়াহাটি', mr: 'गुवाहाटी', ta: 'குவஹாத்தி', te: 'గువాహటి', kn: 'ಗುವಾಹಟಿ', ml: 'ഗുവാഹത്തി', gu: 'ગુવાહાટી', pa: 'ਗੁਹਾਟੀ', or: 'ଗୁଆହାଟି' },
    haridwar: { bn: 'হরিদ্বার', mr: 'हरिद्वार', ta: 'ஹரித்வார்', te: 'హరిద్వార్', kn: 'ಹರಿದ್ವಾರ', ml: 'ഹരിദ്വാർ', gu: 'હરિદ્વાર', pa: 'ਹਰਿਦੁਆਰ', or: 'ହରିଦ୍ୱାର' },
    kolkata: { hi: 'कोलकाता', bn: 'কলকাতা', mr: 'कोलकाता', ta: 'கொல்கத்தா', te: 'కోల్‌కతా', kn: 'ಕೋಲ್ಕತ್ತಾ', ml: 'കൊൽക്കത്ത', gu: 'કોલકાતા', pa: 'ਕੋਲਕਾਤਾ', or: 'କୋଲକାତା' }
  };
  var RAW = [
    ['NDLS', 'New Delhi', 'नई दिल्ली', 28.643, 77.219, 'NR', 'metro', ['delhi', 'new delhi', 'dilli', 'ndls'], null],
    ['CDG', 'Chandigarh', 'चंडीगढ़', 30.700, 76.820, 'NR', 'city', ['chandigarh', 'chd'], null],
    ['KLK', 'Kalka', 'कालका', 30.840, 76.940, 'NR', 'hills', ['kalka'], { pa: 'ਕਾਲਕਾ' }],
    ['SML', 'Shimla', 'शिमला', 31.100, 77.170, 'NR', 'hills', ['shimla', 'simla'], CITY.shimla],
    ['ASR', 'Amritsar Jn', 'अमृतसर', 31.630, 74.870, 'NR', 'temple heritage', ['amritsar', 'golden temple'], CITY.amritsar],
    ['JAT', 'Jammu Tawi', 'जम्मू तवी', 32.710, 74.880, 'NR', 'temple hills', ['jammu', 'katra', 'vaishno devi'], { pa: 'ਜੰਮੂ ਤਵੀ' }],
    ['UMB', 'Ambala Cantt', 'अंबाला छावनी', 30.338, 76.835, 'NR', 'city', ['ambala'], null],
    ['HW', 'Haridwar Jn', 'हरिद्वार', 29.950, 78.160, 'NR', 'temple', ['haridwar', 'hardwar', 'rishikesh'], CITY.haridwar],
    ['DDN', 'Dehradun', 'देहरादून', 30.320, 78.030, 'NR', 'hills', ['dehradun', 'mussoorie'], null],
    ['AGC', 'Agra Cantt', 'आगरा छावनी', 27.160, 77.990, 'NCR', 'heritage', ['agra', 'taj mahal'], CITY.agra],
    ['LKO', 'Lucknow', 'लखनऊ', 26.830, 80.920, 'NR', 'heritage', ['lucknow', 'lko'], CITY.lucknow],
    ['PRYJ', 'Prayagraj Jn', 'प्रयागराज', 25.440, 81.830, 'NCR', 'temple', ['prayagraj', 'allahabad', 'sangam'], null],
    ['BSB', 'Varanasi Jn', 'वाराणसी', 25.320, 82.990, 'NR', 'temple heritage', ['varanasi', 'banaras', 'benares', 'kashi', 'बनारस', 'काशी'], CITY.varanasi],
    ['PNBE', 'Patna Jn', 'पटना', 25.600, 85.140, 'ECR', 'city', ['patna'], CITY.patna],
    ['JP', 'Jaipur', 'जयपुर', 26.920, 75.790, 'NWR', 'heritage family', ['jaipur', 'pink city'], CITY.jaipur],
    ['JU', 'Jodhpur', 'जोधपुर', 26.280, 73.020, 'NWR', 'heritage', ['jodhpur'], null],
    ['UDZ', 'Udaipur City', 'उदयपुर', 24.570, 73.690, 'NWR', 'heritage family', ['udaipur'], null],
    ['ADI', 'Ahmedabad Jn', 'अहमदाबाद', 23.030, 72.600, 'WR', 'city', ['ahmedabad', 'amdavad'], CITY.ahmedabad],
    ['BCT', 'Mumbai Central', 'मुंबई सेंट्रल', 18.970, 72.820, 'WR', 'metro', ['mumbai central', 'bct'], null],
    ['CSMT', 'Mumbai CSMT', 'मुंबई छत्रपति शिवाजी महाराज टर्मिनस', 18.940, 72.835, 'CR', 'metro', ['mumbai', 'bombay', 'csmt', 'cst', 'vt', 'मुंबई', 'मुम्बई', 'बंबई'], CITY.mumbai],
    ['PUNE', 'Pune Jn', 'पुणे', 18.530, 73.870, 'CR', 'city', ['pune', 'poona'], CITY.pune],
    ['MAO', 'Madgaon (Goa)', 'मडगांव (गोवा)', 15.270, 73.970, 'KR', 'beach family', ['goa', 'madgaon', 'margao', 'गोवा'], CITY.goa],
    ['NGP', 'Nagpur', 'नागपुर', 21.150, 79.090, 'CR', 'city', ['nagpur'], { mr: 'नागपूर' }],
    ['BPL', 'Bhopal Jn', 'भोपाल', 23.270, 77.410, 'WCR', 'city', ['bhopal'], null],
    ['INDB', 'Indore Jn', 'इंदौर', 22.720, 75.870, 'WR', 'city', ['indore'], null],
    ['SBC', 'KSR Bengaluru', 'बेंगलुरु', 12.980, 77.570, 'SWR', 'metro', ['bengaluru', 'bangalore', 'blr', 'बैंगलोर'], CITY.bengaluru],
    ['MYS', 'Mysuru Jn', 'मैसूरु', 12.320, 76.650, 'SWR', 'heritage family', ['mysuru', 'mysore'], { kn: 'ಮೈಸೂರು', ta: 'மைசூர்' }],
    ['MAS', 'Chennai Central', 'चेन्नई सेंट्रल', 13.080, 80.270, 'SR', 'metro', ['chennai', 'madras', 'chennai central', 'चेन्नई'], CITY.chennai],
    ['MS', 'Chennai Egmore', 'चेन्नई एग्मोर', 13.078, 80.260, 'SR', 'metro', ['egmore'], null],
    ['MDU', 'Madurai', 'मदुरै', 9.920, 78.120, 'SR', 'temple', ['madurai'], null],
    ['TVC', 'Thiruvananthapuram Central', 'तिरुवनंतपुरम', 8.490, 76.950, 'SR', 'temple beach', ['thiruvananthapuram', 'trivandrum'], { ml: 'തിരുവനന്തപുരം', ta: 'திருவனந்தபுரம்' }],
    ['ERS', 'Ernakulam Jn', 'एर्नाकुलम', 9.970, 76.290, 'SR', 'beach family', ['ernakulam', 'kochi', 'cochin'], { ml: 'എറണാകുളം', ta: 'கொச்சி' }],
    ['SC', 'Secunderabad Jn', 'सिकंदराबाद', 17.430, 78.500, 'SCR', 'metro', ['secunderabad', 'hyderabad', 'हैदराबाद'], CITY.hyderabad],
    ['BZA', 'Vijayawada', 'विजयवाड़ा', 16.520, 80.620, 'SCR', 'temple', ['vijayawada'], { te: 'విజయవాడ' }],
    ['HWH', 'Howrah', 'हावड़ा', 22.580, 88.340, 'ER', 'metro', ['howrah', 'kolkata', 'calcutta', 'कोलकाता'], CITY.kolkata],
    ['PURI', 'Puri', 'पुरी', 19.810, 85.830, 'ECoR', 'temple beach', ['puri'], null],
    ['BBS', 'Bhubaneswar', 'भुवनेश्वर', 20.270, 85.840, 'ECoR', 'temple', ['bhubaneswar'], { or: 'ଭୁବନେଶ୍ୱର' }],
    ['GHY', 'Guwahati', 'गुवाहाटी', 26.180, 91.750, 'NFR', 'temple hills', ['guwahati', 'gauhati'], CITY.guwahati],
    ['NJP', 'New Jalpaiguri', 'न्यू जलपाईगुड़ी', 26.680, 88.440, 'NFR', 'hills', ['new jalpaiguri', 'siliguri', 'darjeeling'], { bn: 'নিউ জলপাইগুড়ি' }]
  ];
  var ZONE_NAMES = { NR: 'Northern Railway', CR: 'Central Railway', WR: 'Western Railway', SR: 'Southern Railway', ER: 'Eastern Railway', ECR: 'East Central Railway', ECoR: 'East Coast Railway',
    NWR: 'North Western Railway', NCR: 'North Central Railway', WCR: 'West Central Railway', SWR: 'South Western Railway', SCR: 'South Central Railway', KR: 'Konkan Railway', NFR: 'Northeast Frontier Railway' };

  var stations = T.stations; // shared with the travel catalogue (stationName etc.)
  RAW.forEach(function (r) {
    var code = r[0], s = stations[code] || (stations[code] = { code: code, names: {}, alias: [] });
    s.code = code; s.lat = r[3]; s.lon = r[4]; s.zone = r[5]; s.tags = r[6].split(' '); s.zoneName = ZONE_NAMES[r[5]] || '';
    s.names.en = s.names.en || r[1]; s.names.hi = s.names.hi || r[2];
    var hand = r[8] || {};
    Object.keys(hand).forEach(function (l) { if (!s.names[l]) s.names[l] = hand[l]; });
    if (!s.city) s.city = r[1].replace(/ (Jn|Cantt|Central|City)$/, '').replace(/^KSR |^Mumbai CSMT$/, '').replace(/\s*\(.*\)$/, '') || r[1];
    if (code === 'CSMT' || code === 'BCT') s.city = 'Mumbai';
    if (code === 'MAO') s.city = 'Goa';
    if (code === 'SC') s.city = 'Hyderabad';
    if (code === 'HWH') s.city = 'Kolkata';
    if (code === 'MAS' || code === 'MS') s.city = 'Chennai';
    if (code === 'SBC') s.city = 'Bengaluru';
    s.alias = (s.alias || []).concat(r[7]);
    // matching-only forms: auto-transliterated Hindi name in every other script
    var m = [];
    Object.keys(BASES).forEach(function (l) { var x = translit(s.names.hi, l); if (x) m.push(x); });
    Object.keys(s.names).forEach(function (l) { m.push(s.names[l]); });
    if (code === 'HWH') Object.keys(CITY.kolkata).forEach(function (l) { m.push(CITY.kolkata[l]); });
    s.match = m.concat(s.alias).map(function (x) { return String(x).toLowerCase(); }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
  });
  // primary station for a city name (several codes share a city)
  var PRIMARY = { mumbai: 'CSMT', chennai: 'MAS', kolkata: 'HWH', hyderabad: 'SC', delhi: 'NDLS' };

  function list() { return RAW.map(function (r) { return stations[r[0]]; }); }
  function dist(a, b) {
    var A = stations[a], B = stations[b];
    if (!A || !B || A.lat == null || B.lat == null) return 300;
    var R = 6371, toR = Math.PI / 180, dLat = (B.lat - A.lat) * toR, dLon = (B.lon - A.lon) * toR;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(A.lat * toR) * Math.cos(B.lat * toR) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var km = 2 * R * Math.asin(Math.sqrt(h)) * 1.24; // rail detour factor
    return Math.max(25, Math.round(km));
  }
  /** Typeahead: stations whose name/alias (any script) starts with or contains the text. */
  function find(text, lang) {
    var q = String(text || '').trim().toLowerCase();
    if (!q) return list().slice(0, 12);
    var exact = [], starts = [], has = [];
    list().forEach(function (s) {
      if (s.code.toLowerCase() === q) { exact.push(s); return; }
      if (s.match.some(function (m) { return m.indexOf(q) === 0; })) starts.push(s);
      else if (s.match.some(function (m) { return m.indexOf(q) >= 0; })) has.push(s);
    });
    return exact.concat(starts, has).slice(0, 10);
  }
  /** All station mentions inside free text: [{code, index, len}] (longest match wins, any script). */
  function mentions(text) {
    var t = ' ' + String(text || '').toLowerCase() + ' ', out = [];
    list().forEach(function (s) {
      var best = null;
      s.match.forEach(function (m) {
        if (m.length < 3 && !/^[a-z]+$/.test(m)) return;
        var re = /^[a-z .]+$/.test(m) ? new RegExp('[^a-z]' + m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z])') : null;
        var idx = -1;
        if (re) { var mm = re.exec(t); idx = mm ? mm.index + 1 : -1; } else idx = t.indexOf(m);
        if (m.length <= 3 && /^[a-z]+$/.test(m)) { // codes like "cdg": only when typed as a separate word
          var r2 = new RegExp('[^a-z]' + m + '[^a-z]'); var m2 = r2.exec(t); idx = m2 ? m2.index + 1 : -1;
        }
        if (idx >= 0 && (!best || m.length > best.len)) best = { code: s.code, index: idx, len: m.length, word: m };
      });
      if (best) out.push(best);
    });
    // a city name shared by several stations ("mumbai") -> keep the primary one
    out = out.filter(function (o) {
      return !out.some(function (p) { return p !== o && p.index <= o.index && p.index + p.len >= o.index + o.len && p.len > o.len; });
    });
    var seen = {};
    out = out.sort(function (a, b) { return a.index - b.index || b.len - a.len; }).filter(function (o) {
      var key = o.index + ':' + o.len;
      if (seen[key]) return false; seen[key] = 1;
      var prim = PRIMARY[o.word]; if (prim && prim !== o.code) return false;
      return true;
    });
    return out;
  }
  function cityCode(text) { var m = mentions(text); return m.length ? m[0].code : null; }

  /* ---------------- Fares ---------------- */
  var CLS = {
    '1A': { name: 'AC First Class', perKm: 3.25, res: 60, sf: 75, ac: true, min: 1200, coach: 'H', berths: 24 },
    '2A': { name: 'AC 2 Tier', perKm: 1.95, res: 50, sf: 45, ac: true, min: 700, coach: 'A', berths: 46 },
    '3A': { name: 'AC 3 Tier', perKm: 1.36, res: 40, sf: 45, ac: true, min: 500, coach: 'B', berths: 72 },
    '3E': { name: 'AC 3 Economy', perKm: 1.22, res: 40, sf: 45, ac: true, min: 450, coach: 'M', berths: 80 },
    'SL': { name: 'Sleeper', perKm: 0.52, res: 20, sf: 30, ac: false, min: 150, coach: 'S', berths: 72 },
    'CC': { name: 'AC Chair Car', perKm: 1.30, res: 40, sf: 45, ac: true, min: 300, coach: 'C', berths: 78 },
    'EC': { name: 'Executive Chair Car', perKm: 2.60, res: 60, sf: 75, ac: true, min: 600, coach: 'E', berths: 56 }
  };
  var PREMIUM = { 'Rajdhani': 1.2, 'Shatabdi': 1.18, 'Vande Bharat': 1.25, 'Duronto': 1.15 };
  function fareBreakup(tr, cls, noScale) {
    var c = CLS[cls]; if (!c) return null;
    if (tr.fixedFare && tr.fixedFare[cls]) {
      var f = tr.fixedFare[cls];
      return { base: f - c.res - c.sf - (c.ac ? Math.round(f * 0.045) : 0), res: c.res, sf: c.sf, gst: c.ac ? Math.round(f * 0.045) : 0, total: f };
    }
    // a train with one published sample fare: scale its other classes by the same ratio so class order stays sane
    var scale = 1;
    if (!noScale && tr.fixedFare) {
      var k = Object.keys(tr.fixedFare)[0], gen = fareBreakup(Object.assign({}, tr, { fixedFare: null }), k, true);
      if (gen && gen.total) scale = tr.fixedFare[k] / gen.total;
    }
    var base = Math.max(c.min, tr.km * c.perKm) * (PREMIUM[tr.type] || 1) * scale;
    base = round5(base);
    var sf = tr.type === 'Mail/Express' ? 0 : c.sf;
    var gst = c.ac ? Math.round((base + c.res + sf) * 0.05) : 0;
    var total = round5(base + c.res + sf + gst);
    if (gst) gst = total - base - c.res - sf; else base = total - c.res - sf; // lines always add up to the total
    return { base: base, res: c.res, sf: sf, gst: gst, total: total };
  }

  /* ---------------- Known trains (real numbers/names; timings illustrative) ---------------- */
  var KNOWN = [
    { no: '12011', name: 'Kalka Shatabdi Express', type: 'Shatabdi', from: 'NDLS', to: 'CDG', dep: '07:40', dur: 205, cls: ['CC', 'EC'], days: '1111111', fixedFare: { CC: 915 } },
    { no: '12005', name: 'Kalka Shatabdi Express', type: 'Shatabdi', from: 'NDLS', to: 'CDG', dep: '17:15', dur: 210, cls: ['CC', 'EC'], days: '1111111' },
    { no: '12046', name: 'Chandigarh–New Delhi Shatabdi Express', type: 'Shatabdi', from: 'CDG', to: 'NDLS', dep: '18:20', dur: 200, cls: ['CC', 'EC'], days: '1111111', fixedFare: { CC: 905 } },
    { no: '12012', name: 'Kalka–New Delhi Shatabdi Express', type: 'Shatabdi', from: 'CDG', to: 'NDLS', dep: '12:15', dur: 215, cls: ['CC', 'EC'], days: '1111111', fixedFare: { CC: 915 } },
    { no: '12952', name: 'Mumbai Rajdhani Express', type: 'Rajdhani', from: 'NDLS', to: 'BCT', dep: '16:55', dur: 940, cls: ['1A', '2A', '3A'], days: '1111111' },
    { no: '12951', name: 'Mumbai Rajdhani Express', type: 'Rajdhani', from: 'BCT', to: 'NDLS', dep: '17:00', dur: 932, cls: ['1A', '2A', '3A'], days: '1111111' },
    { no: '12302', name: 'Howrah Rajdhani Express', type: 'Rajdhani', from: 'NDLS', to: 'HWH', dep: '16:50', dur: 1025, cls: ['1A', '2A', '3A'], days: '1111111' },
    { no: '12301', name: 'Howrah Rajdhani Express', type: 'Rajdhani', from: 'HWH', to: 'NDLS', dep: '16:50', dur: 1020, cls: ['1A', '2A', '3A'], days: '1111111' },
    { no: '12029', name: 'Swarna Shatabdi Express', type: 'Shatabdi', from: 'NDLS', to: 'ASR', dep: '07:20', dur: 375, cls: ['CC', 'EC'], days: '1111111' },
    { no: '12002', name: 'Bhopal Shatabdi Express', type: 'Shatabdi', from: 'NDLS', to: 'BPL', dep: '06:00', dur: 505, cls: ['CC', 'EC'], days: '1111111' },
    { no: '22435', name: 'New Delhi–Varanasi Vande Bharat Express', type: 'Vande Bharat', from: 'NDLS', to: 'BSB', dep: '06:00', dur: 480, cls: ['CC', 'EC'], days: '1101111' },
    { no: '12123', name: 'Deccan Queen', type: 'Superfast', from: 'CSMT', to: 'PUNE', dep: '17:10', dur: 195, cls: ['CC'], days: '1111111' },
    { no: '12124', name: 'Deccan Queen', type: 'Superfast', from: 'PUNE', to: 'CSMT', dep: '07:15', dur: 190, cls: ['CC'], days: '1111111' },
    { no: '12007', name: 'Mysuru Shatabdi Express', type: 'Shatabdi', from: 'MAS', to: 'MYS', dep: '06:00', dur: 420, cls: ['CC', 'EC'], days: '1110111' },
    { no: '12637', name: 'Pandian Express', type: 'Superfast', from: 'MS', to: 'MDU', dep: '21:40', dur: 455, cls: ['1A', '2A', '3A', 'SL'], days: '1111111', fixedFare: { '3A': 1105 } },
    { no: '12638', name: 'Pandian Express', type: 'Superfast', from: 'MDU', to: 'MS', dep: '21:35', dur: 455, cls: ['1A', '2A', '3A', 'SL'], days: '1111111', fixedFare: { '3A': 1105 } },
    { no: '12837', name: 'Howrah–Puri Superfast Express', type: 'Superfast', from: 'HWH', to: 'PURI', dep: '22:35', dur: 470, cls: ['2A', '3A', 'SL'], days: '1111111', fixedFare: { '3A': 1240 } },
    { no: '12838', name: 'Puri–Howrah Superfast Express', type: 'Superfast', from: 'PURI', to: 'HWH', dep: '19:55', dur: 485, cls: ['2A', '3A', 'SL'], days: '1111111', fixedFare: { '3A': 1240 } }
  ];

  /* ---------------- Generator ---------------- */
  var SPEED = { 'Rajdhani': 76, 'Duronto': 74, 'Vande Bharat': 80, 'Shatabdi': 75, 'Jan Shatabdi': 58, 'Superfast': 60, 'Mail/Express': 52, 'Garib Rath': 60, 'Humsafar': 62 };
  var CLASSES = { 'Rajdhani': ['1A', '2A', '3A'], 'Duronto': ['1A', '2A', '3A', 'SL'], 'Vande Bharat': ['CC', 'EC'], 'Shatabdi': ['CC', 'EC'], 'Jan Shatabdi': ['CC'],
    'Superfast': ['2A', '3A', '3E', 'SL'], 'Mail/Express': ['2A', '3A', 'SL'], 'Garib Rath': ['3E'], 'Humsafar': ['3A', '3E'] };
  var PREFIX = { 'Rajdhani': ['124', '123', '224'], 'Duronto': ['122', '222'], 'Vande Bharat': ['224', '208', '226'], 'Shatabdi': ['120', '220'], 'Jan Shatabdi': ['120', '120'],
    'Superfast': ['126', '127', '128', '129', '221', '228'], 'Mail/Express': ['111', '138', '145', '146', '168', '182', '193'], 'Garib Rath': ['122', '129'], 'Humsafar': ['223', '229'] };
  function cityShort(code) { var s = stations[code]; return s ? (s.city || s.names.en) : code; }
  function nameFor(type, a, b) {
    var A = cityShort(a), B = cityShort(b);
    if (type === 'Rajdhani') return (a === 'NDLS' ? B : A) + ' Rajdhani Express';
    if (type === 'Mail/Express') return A + '–' + B + ' Express';
    if (type === 'Superfast') return A + '–' + B + ' Superfast Express';
    return A + '–' + B + ' ' + type + ' Express';
  }
  function genTrains(a, b) {
    var km = dist(a, b), r = rng('pair:' + [a, b].sort().join('-') + (a < b ? '>' : '<'));
    var types = [];
    var metro = function (c) { return stations[c] && stations[c].tags.indexOf('metro') >= 0; };
    if (km >= 650 && (a === 'NDLS' || b === 'NDLS')) types.push('Rajdhani');
    if (km >= 700 && r() > 0.45) types.push('Duronto');
    if (km >= 180 && km <= 820 && (metro(a) || metro(b) || r() > 0.5)) types.push('Vande Bharat');
    if (km >= 140 && km <= 700 && r() > 0.35) types.push('Shatabdi');
    if (km <= 550 && r() > 0.55) types.push('Jan Shatabdi');
    types.push('Superfast');
    types.push('Mail/Express');
    if (km >= 500 && r() > 0.5) types.push('Garib Rath');
    if (km >= 900 && r() > 0.6) types.push('Humsafar');
    if (r() > 0.4) types.push('Superfast');
    if (km > 300 && r() > 0.5) types.push('Mail/Express');
    var used = {}, out = [];
    types.forEach(function (type, i) {
      var pre = PREFIX[type][Math.floor(r() * PREFIX[type].length)];
      var no;
      do { no = pre + pad(Math.floor(r() * 100)); } while (used[no] || KNOWN.some(function (k) { return k.no === no; }));
      used[no] = 1;
      var day = (type === 'Shatabdi' || type === 'Vande Bharat' || type === 'Jan Shatabdi');
      var dep;
      if (day) dep = r() > 0.4 ? 300 + Math.floor(r() * 150) : 840 + Math.floor(r() * 150);
      else if (type === 'Rajdhani' || type === 'Duronto' || type === 'Humsafar') dep = 960 + Math.floor(r() * 300);
      else dep = Math.floor(r() * 1440);
      dep = Math.round(dep / 5) * 5;
      var dur = Math.round(km / SPEED[type] * 60 * (0.95 + r() * 0.15) / 5) * 5 + 10;
      var days = '1111111';
      if (type === 'Duronto' || type === 'Garib Rath' || type === 'Humsafar') { days = ''; for (var d = 0; d < 7; d++) days += r() > 0.55 ? '1' : '0'; if (days.indexOf('1') < 0) days = '0010010'; }
      if (type === 'Vande Bharat') { var off = Math.floor(r() * 7); days = '1111111'.split('').map(function (c, k) { return k === off ? '0' : '1'; }).join(''); }
      out.push({ no: no, name: nameFor(type, a, b), type: type, from: a, to: b, dep: hm(dep), dur: dur, cls: CLASSES[type], days: days, generated: true });
    });
    return out;
  }

  /* days string index: 0=Mon … 6=Sun */
  function runsOn(tr, dateStr) { var w = (parseYmd(dateStr).getDay() + 6) % 7; return tr.days.charAt(w) === '1'; }

  function decorate(t, dateStr) {
    var km = dist(t.from, t.to);
    var depM = toMin(t.dep), arrM = depM + t.dur;
    var tr = Object.assign({}, t, { km: km, arr: hm(arrM), arrOffset: Math.floor(arrM / 1440), date: dateStr, simulated: true });
    tr.runs = runsOn(tr, dateStr);
    var r = rng('chk:' + tr.no + dateStr);
    tr.source = { name: 'IRCTC schedule & availability (simulated)', ref: 'SCHED/' + tr.no, checkedAt: new Date(Date.now() - (3 + Math.floor(r() * 40)) * 60000).toISOString() };
    // Verification Agent re-check against a second source (NTES-style running info, simulated).
    tr.flags = [];
    if (tr.generated && hash(tr.no + dateStr) % 7 === 3) {
      tr.flags.push({ kind: 'timing', key: 'rail.flagTiming', en: 'Departure revised by 10 min at the second source (NTES, simulated); confirm before travel' });
      tr.verdict = 'confirm';
    } else tr.verdict = 'verified';
    tr.classes = tr.cls.map(function (c) { return { cls: c, fare: fareBreakup(tr, c), avail: avail(tr, c, dateStr) }; });
    return tr;
  }

  /* ---------------- Availability ---------------- */
  function pressure(dateStr) {
    var p = 0;
    if (OT.data.demand && OT.data.demand.pressure) { try { p = OT.data.demand.pressure(dateStr); } catch (e) { p = 0; } }
    var w = parseYmd(dateStr).getDay();
    if (w === 5 || w === 0) p += 0.12;
    return p;
  }
  function daysTo(dateStr) { var t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((parseYmd(dateStr) - t) / 86400000); }
  function avail(tr, cls, dateStr) {
    var r = rng('av:' + tr.no + cls + dateStr)();
    var days = daysTo(dateStr);
    var score = r - pressure(dateStr) * 0.55 - (days >= 0 && days < 5 ? 0.18 : 0) + (cls === '1A' || cls === 'EC' ? 0.18 : 0) - (cls === 'SL' || cls === '3A' ? 0.06 : 0);
    var n = 1 + Math.floor(r * 97) % 60;
    if (days < 0) return { state: 'DEPARTED', n: 0, label: 'DEPARTED' };
    if (days === 0 && tr.dep) {   // same day: booking closes 30 min before departure (simulated rule)
      var nw = new Date();
      if (toMin(tr.dep) <= nw.getHours() * 60 + nw.getMinutes() + 30) return { state: 'DEPARTED', n: 0, label: 'DEPARTED' };
    }
    if (tr.no === '12011' && cls === 'CC') { var k = 12 + hash(dateStr) % 30; return { state: 'AVAILABLE', n: k, label: 'AVAILABLE-' + k }; }
    if (score > 0.42) return { state: 'AVAILABLE', n: n, label: 'AVAILABLE-' + n };
    if (score > 0.28) { var rac = 1 + n % 24; return { state: 'RAC', n: rac, label: 'RAC ' + rac }; }
    if (score > 0.02) { var wl = 1 + Math.floor((0.28 - score) * 260) % 120; return { state: 'WL', n: wl, label: 'GNWL ' + wl }; }
    return { state: 'REGRET', n: 0, label: 'REGRET' };
  }
  /** Simulated "chance of confirmation" (%) for RAC / WL. */
  function chance(av, dateStr) {
    if (!av) return null;
    if (av.state === 'AVAILABLE') return 100;
    if (av.state === 'RAC') return Math.max(80, 97 - av.n);
    if (av.state === 'WL') {
      var d = Math.max(0, daysTo(dateStr));
      return Math.max(5, Math.min(92, Math.round(95 - av.n * 1.6 + Math.min(d, 30) * 0.6 - pressure(dateStr) * 25)));
    }
    return 0;
  }

  /* ---------------- Search ---------------- */
  function search(a, b, dateStr) {
    if (!a || !b || a === b || !stations[a] || !stations[b]) return [];
    var known = KNOWN.filter(function (k) { return k.from === a && k.to === b; });
    var gen = genTrains(a, b);
    if (known.length) gen = gen.slice(0, Math.max(2, 5 - known.length));
    return known.concat(gen).map(function (t) { return decorate(t, dateStr); })
      .sort(function (x, y) { return toMin(x.dep) - toMin(y.dep); });
  }
  function train(no, a, b, dateStr) { return search(a, b, dateStr).filter(function (t) { return t.no === no; })[0] || null; }
  function best(a, b, dateStr, prefCls) {
    var l = search(a, b, dateStr).filter(function (t) { return t.runs && t.classes.some(function (c) { return c.avail.state !== 'DEPARTED'; }); });
    if (!l.length) return null;
    var score = function (t) { return (t.no === '12011' ? -1000 : 0) + t.dur - (PREMIUM[t.type] ? 60 : 0) + (prefCls && t.cls.indexOf(prefCls) < 0 ? 300 : 0) + (toMin(t.dep) < 300 ? 200 : 0); };
    return l.sort(function (x, y) { return score(x) - score(y); })[0];
  }

  /* ---------------- Booking (simulated) ---------------- */
  var BERTH_SL = ['LB', 'MB', 'UB', 'LB', 'MB', 'UB', 'SL', 'SU'];
  function book(o) {
    var tr = train(o.no, o.from, o.to, o.date);
    if (!tr) throw new Error('Train not found');
    var c = tr.classes.filter(function (x) { return x.cls === o.cls; })[0];
    var pnr = String(4 + Math.floor(Math.random() * 5)) + String(Math.floor(Math.random() * 1e9 + 1e9)).slice(1, 10);
    var r = rng('bk:' + pnr), av = c.avail, sleeper = ['1A', '2A', '3A', '3E', 'SL'].indexOf(o.cls) >= 0;
    var coachN = 1 + Math.floor(r() * (o.cls === 'SL' ? 10 : o.cls === '1A' || o.cls === 'EC' ? 1 : 6));
    var seat0 = 1 + Math.floor(r() * (CLS[o.cls].berths - 8));
    var pax = (o.passengers || []).map(function (p, i) {
      var st, coach = null, berth = null, btype = null;
      if (av.state === 'AVAILABLE') {
        st = 'CNF'; coach = CLS[o.cls].coach + coachN; berth = seat0 + i;
        btype = sleeper ? (p.pref && p.pref !== 'NP' && p.pref !== 'W' && p.pref !== 'A' ? p.pref : BERTH_SL[(berth - 1) % 8]) : (p.pref === 'W' ? 'WS' : p.pref === 'A' ? 'AS' : berth % 4 === 1 || berth % 4 === 0 ? 'WS' : 'AS');
      } else if (av.state === 'RAC') { st = 'RAC ' + (av.n + i); }
      else if (av.state === 'WL') { st = 'WL ' + (av.n + i); }
      else st = 'REGRET';
      return Object.assign({}, p, { status: st, coach: coach, berth: berth, berthType: btype });
    });
    var fare = c.fare, n = pax.length;
    var conv = o.method === 'card' ? 35 : 20;
    return {
      pnr: pnr, no: tr.no, name: tr.name, type: tr.type, from: tr.from, to: tr.to, fromName: stations[tr.from].names.en, toName: stations[tr.to].names.en,
      date: tr.date, dep: tr.dep, arr: tr.arr, arrOffset: tr.arrOffset, arrDate: T.addDays(tr.date, tr.arrOffset), dur: tr.dur, km: tr.km, cls: o.cls, quota: 'GN',
      status: av.state === 'AVAILABLE' ? 'CNF' : av.state === 'RAC' ? 'RAC' : av.state === 'WL' ? 'WL' : 'REGRET',
      chance: chance(av, tr.date), passengers: pax, farePerPax: fare.total, fare: fare, conv: conv, total: fare.total * n + conv,
      bookedAt: new Date().toISOString(), simulated: true
    };
  }

  /* ---------------- Railway-style cancellation (SIMULATED, simplified) ---------------- */
  var FLAT = { '1A': 240, 'EC': 240, '2A': 200, '3A': 180, 'CC': 180, '3E': 180, 'SL': 120 };
  function refund(tk, nowMs) {
    nowMs = nowMs || Date.now();
    var dep = new Date(tk.date + 'T' + tk.dep + ':00').getTime();
    var h = (dep - nowMs) / 3600000, n = (tk.passengers || []).length || 1, per = tk.farePerPax, charge, rule;
    if (tk.status === 'WL' || tk.status === 'RAC') { charge = 60 * n; rule = 'rail.ruleWl'; }
    else if (h > 48) { charge = (FLAT[tk.cls] || 180) * n; rule = 'rail.rule48'; }
    else if (h > 12) { charge = Math.max((FLAT[tk.cls] || 180), Math.round(per * 0.25)) * n; rule = 'rail.rule12'; }
    else if (h > 4) { charge = Math.max((FLAT[tk.cls] || 180), Math.round(per * 0.5)) * n; rule = 'rail.rule4'; }
    else { charge = per * n; rule = 'rail.ruleChart'; }
    var amount = Math.max(0, per * n - charge);
    return { amount: amount, charge: Math.min(charge, per * n), rule: rule, hoursLeft: h, convNonRefundable: tk.conv };
  }

  OT.data.rail = {
    simulated: true,
    stations: stations, list: list, find: find, mentions: mentions, cityCode: cityCode, dist: dist,
    classes: CLS, search: search, train: train, best: best, runsOn: runsOn,
    fare: fareBreakup, avail: avail, chance: chance, book: book, refund: refund,
    zoneName: function (code) { var s = stations[code]; return s ? s.zoneName : ''; },
    hm: hm, toMin: toMin, ymd: ymd, parseYmd: parseYmd, hash: hash, rng: rng, daysTo: daysTo
  };
})();
