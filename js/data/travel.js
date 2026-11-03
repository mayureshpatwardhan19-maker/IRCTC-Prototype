/* IRCTC OneTrip — SIMULATED travel catalogue (Builder A).
 *
 * Every train, hotel, cab, meal and sight here is SAMPLE DATA for an academic demo.
 * Train numbers/names follow real formats but timings are illustrative ("sample timing — not live").
 * Hotels, cabs and providers are fictional. No live IRCTC / provider API is called.
 *
 * Each bookable item carries:
 *   source          — what the Research Agent read (the OneTrip listing feed) + when it was checked
 *   providerSource  — an independent copy "at the provider" that the Verification Agent re-checks.
 *                     Deliberate mismatches are planted so verification has something to catch:
 *                       H-CDG-02  price changed at source (₹2,650 → ₹2,890)      -> Needs confirmation
 *                       H-CDG-04  record checked > 6 h ago (stale)                -> Needs confirmation
 *                       H-CDG-05  rating missing at source                        -> Needs confirmation
 *                       H-CDG-06  sold out at source                              -> hidden (Unavailable)
 *                       H-CDG-07  over the ₹3,000 budget                          -> filtered by Recommendation
 *                       C-CDG-05  stale; S-CDG-02 cancellation policy missing    -> Needs confirmation
 *   checkedMins     — "checked N minutes ago" (converted to an ISO timestamp at page load, so the
 *                     staleness rule keeps working whatever day the demo runs).
 */
(function () {
  'use strict';
  var OT = window.OT;
  OT.data = OT.data || {};

  var LOAD = Date.now();
  function ago(mins) { return new Date(LOAD - mins * 60000).toISOString(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /* ---------- Stations (names in every supported script; codes are never translated) ---------- */
  var stations = {
    NDLS: { code: 'NDLS', zone: 'NR', names: { en: 'New Delhi', hi: 'नई दिल्ली', bn: 'নতুন দিল্লি', mr: 'नवी दिल्ली', ta: 'புது தில்லி', te: 'న్యూఢిల్లీ', kn: 'ನವದೆಹಲಿ', ml: 'ന്യൂ ഡൽഹി', gu: 'નવી દિલ્હી', pa: 'ਨਵੀਂ ਦਿੱਲੀ', or: 'ନୂଆଦିଲ୍ଲୀ' }, alias: ['delhi', 'new delhi', 'dilli', 'दिल्ली'] },
    CDG: { code: 'CDG', zone: 'NR', city: 'Chandigarh', names: { en: 'Chandigarh', hi: 'चंडीगढ़', bn: 'চণ্ডীগড়', mr: 'चंदीगड', ta: 'சண்டிகர்', te: 'చండీగఢ్', kn: 'ಚಂಡೀಗಢ', ml: 'ചണ്ഡീഗഢ്', gu: 'ચંડીગઢ', pa: 'ਚੰਡੀਗੜ੍ਹ', or: 'ଚଣ୍ଡୀଗଡ଼' }, alias: ['chandigarh', 'chandigad', 'chandigadh', 'चण्डीगढ़', 'चंडीगड', 'tricity'] },
    MS: { code: 'MS', zone: 'SR', names: { en: 'Chennai Egmore', hi: 'चेन्नई एग्मोर', bn: 'চেন্নাই এগমোর', mr: 'चेन्नई एग्मोर', ta: 'சென்னை எழும்பூர்', te: 'చెన్నై ఎగ్మోర్', kn: 'ಚೆನ್ನೈ ಎಗ್ಮೋರ್', ml: 'ചെന്നൈ എഗ്മോർ', gu: 'ચેન્નઈ એગ્મોર', pa: 'ਚੇਨਈ ਐਗਮੋਰ', or: 'ଚେନ୍ନାଇ ଏଗମୋର' }, alias: ['chennai', 'madras', 'egmore', 'சென்னை', 'चेन्नई'] },
    MDU: { code: 'MDU', zone: 'SR', city: 'Madurai', names: { en: 'Madurai', hi: 'मदुरै', bn: 'মাদুরাই', mr: 'मदुराई', ta: 'மதுரை', te: 'మధురై', kn: 'ಮಧುರೈ', ml: 'മധുര', gu: 'મદુરાઈ', pa: 'ਮਦੁਰਈ', or: 'ମଦୁରାଇ' }, alias: ['madurai', 'madurai jn', 'मदुरई'] },
    HWH: { code: 'HWH', zone: 'ER', names: { en: 'Howrah', hi: 'हावड़ा', bn: 'হাওড়া', mr: 'हावडा', ta: 'ஹவுரா', te: 'హౌరా', kn: 'ಹೌರಾ', ml: 'ഹൗറ', gu: 'હાવડા', pa: 'ਹਾਵੜਾ', or: 'ହାୱଡ଼ା' }, alias: ['howrah', 'kolkata', 'calcutta', 'কলকাতা', 'कोलकाता'] },
    PURI: { code: 'PURI', zone: 'ECoR', city: 'Puri', names: { en: 'Puri', hi: 'पुरी', bn: 'পুরী', mr: 'पुरी', ta: 'பூரி', te: 'పూరీ', kn: 'ಪುರಿ', ml: 'പുരി', gu: 'પુરી', pa: 'ਪੁਰੀ', or: 'ପୁରୀ' }, alias: ['puri', 'jagannath puri'] },
    UMB: { code: 'UMB', zone: 'NR', names: { en: 'Ambala Cantt', hi: 'अंबाला छावनी' }, alias: [] }
  };

  /* ---------- Sample trains (illustrative timings) ---------- */
  var trains = {
    '12011': { no: '12011', name: 'Kalka Shatabdi Express', from: 'NDLS', to: 'CDG', dep: '07:40', arr: '11:05', arrOffset: 0, durMin: 205, cls: 'CC', farePerPax: 915,
      stops: [{ code: 'UMB', arr: '09:58' }] },
    '12046': { no: '12046', name: 'Chandigarh–New Delhi Shatabdi Express', from: 'CDG', to: 'NDLS', dep: '18:20', arr: '21:40', arrOffset: 0, durMin: 200, cls: 'CC', farePerPax: 905, stops: [] },
    '12637': { no: '12637', name: 'Pandian Express', from: 'MS', to: 'MDU', dep: '21:40', arr: '05:15', arrOffset: 1, durMin: 455, cls: '3A', farePerPax: 1105, stops: [] },
    '12638': { no: '12638', name: 'Pandian Express', from: 'MDU', to: 'MS', dep: '21:35', arr: '05:10', arrOffset: 1, durMin: 455, cls: '3A', farePerPax: 1105, stops: [] },
    '12837': { no: '12837', name: 'Howrah–Puri Superfast Express', from: 'HWH', to: 'PURI', dep: '22:35', arr: '06:25', arrOffset: 1, durMin: 470, cls: '3A', farePerPax: 1240, stops: [] },
    '12838': { no: '12838', name: 'Puri–Howrah Superfast Express', from: 'PURI', to: 'HWH', dep: '19:55', arr: '04:00', arrOffset: 1, durMin: 485, cls: '3A', farePerPax: 1240, stops: [] }
  };

  /* ---------- Scenarios: one per destination so other languages have a story ---------- */
  var scenarios = {
    CDG: { key: 'CDG', lang: 'hi', persona: 'Sunita Sharma', from: 'NDLS', to: 'CDG', trainNo: '12011', returnNo: '12046', pnr: '4521837690', returnPnr: '4521837711',
      passengers: 2, budget: 3000, nights: 2, coach: 'C3', seats: ['41', '42'], prefs: { veg: true, nearStation: true, freeCancel: true } },
    MDU: { key: 'MDU', lang: 'ta', persona: 'Ramesh Iyer', from: 'MS', to: 'MDU', trainNo: '12637', returnNo: '12638', pnr: '6203145578', returnPnr: '6203145602',
      passengers: 3, budget: 2000, nights: 1, coach: 'B2', seats: ['33', '34', '36'], prefs: { veg: true, temple: true, nearStation: true } },
    PURI: { key: 'PURI', lang: 'bn', persona: 'Mitali Das', from: 'HWH', to: 'PURI', trainNo: '12837', returnNo: '12838', pnr: '8132406659', returnPnr: '8132406671',
      passengers: 4, budget: 2500, nights: 2, coach: 'B1', seats: ['11', '12', '13', '14'], prefs: { veg: false, family: true, temple: true } }
  };

  /* Comparison helper: OneTrip price vs 2-3 simulated providers (fictional names). */
  function cmp(a, b, c) {
    var out = [{ name: 'TravelSite A (sample)', price: a }, { name: 'TravelSite B (sample)', price: b }];
    if (c) out.push({ name: 'Walk-in / counter rate (sample)', price: c });
    return out;
  }

  /* ---------- Hotels ---------- */
  var hotels = [
    { id: 'H-CDG-01', city: 'CDG', partnerId: 'P-101', name: 'Hotel Shivalik View', provider: 'Hotel Shivalik View', managed: 'partner', sponsored: false,
      price: 2650, basis: 'night', rating: 4.4, reviews: 1284, distanceKm: 1.2, area: 'Industrial Area Ph-I, 1.2 km from CDG',
      checkIn: '14:00', checkOut: '11:00', earlyCheckIn: { fee: 500 }, availability: 'available', left: 4, tags: ['veg', 'family', 'nearStation', 'freeCancel', 'ac', 'wifi'],
      policy: { fullUntilH: 24, thenPct: 50 },
      desc: { en: 'Pure-veg restaurant, family rooms, lift and 24-hour desk. Station shuttle on request.', hi: 'शुद्ध शाकाहारी रेस्टोरेंट, फैमिली रूम, लिफ्ट और 24 घंटे रिसेप्शन। अनुरोध पर स्टेशन शटल।' },
      source: { name: 'Partner Hotel API (simulated)', ref: 'PHAPI/P-101/rates', checkedMins: 12 },
      providerSource: { name: 'Hotel Shivalik View rate sheet (simulated)', price: 2650, rating: 4.4, availability: 'available', checkedMins: 9 },
      compare: cmp(2890, 2790, 3200) },
    { id: 'H-CDG-02', city: 'CDG', partnerId: 'P-102', name: 'Sector 17 Comfort Inn', provider: 'Sector 17 Comfort Inn', managed: 'partner', sponsored: false,
      price: 2650, basis: 'night', rating: 4.1, reviews: 642, distanceKm: 6.4, area: 'Sector 17, 6.4 km from CDG',
      checkIn: '12:00', checkOut: '11:00', availability: 'available', left: 2, tags: ['family', 'freeCancel', 'ac', 'wifi', 'market'],
      policy: { fullUntilH: 48, thenPct: 0 },
      desc: { en: 'Walkable to Sector 17 market and Plaza. Breakfast included.', hi: 'सेक्टर 17 मार्केट और प्लाज़ा पैदल दूरी पर। नाश्ता शामिल।' },
      source: { name: 'Partner Hotel API (simulated)', ref: 'PHAPI/P-102/rates', checkedMins: 25 },
      providerSource: { name: 'Sector 17 Comfort Inn booking engine (simulated)', price: 2890, rating: 4.1, availability: 'available', checkedMins: 6 },
      compare: cmp(2950, 2890, 3100) },
    { id: 'H-CDG-03', city: 'CDG', partnerId: 'P-103', name: 'Rail Yatri Niwas, Chandigarh (sample)', provider: 'IRCTC Tourism (sample)', managed: 'irctc', sponsored: false,
      price: 1850, basis: 'night', rating: 4.0, reviews: 2210, distanceKm: 0.4, area: 'Station premises, 0.4 km from CDG',
      checkIn: '12:00', checkOut: '10:00', availability: 'few', left: 1, tags: ['veg', 'nearStation', 'budget', 'ac'],
      policy: { fullUntilH: 24, thenPct: 75 },
      desc: { en: 'Budget rooms right at the station. Basic, clean, IRCTC-managed (sample).', hi: 'स्टेशन पर ही किफायती कमरे। साफ-सुथरे, IRCTC द्वारा संचालित (सैंपल)।' },
      source: { name: 'IRCTC Tourism catalogue (sample)', ref: 'IRCTC-TOUR/RYN-CDG', checkedMins: 40 },
      providerSource: { name: 'IRCTC Tourism inventory (sample)', price: 1850, rating: 4.0, availability: 'few', checkedMins: 31 },
      compare: cmp(1990, 1950) },
    { id: 'H-CDG-04', city: 'CDG', partnerId: 'P-104', name: 'Hotel Sukhna Greens', provider: 'Hotel Sukhna Greens', managed: 'partner', sponsored: true,
      price: 2200, basis: 'night', rating: 4.2, reviews: 518, distanceKm: 3.8, area: 'Near Sukhna Lake, 3.8 km from CDG',
      checkIn: '13:00', checkOut: '11:00', availability: 'available', left: 5, tags: ['veg', 'family', 'lake', 'freeCancel'],
      policy: { fullUntilH: 24, thenPct: 0 },
      desc: { en: 'Quiet rooms a short walk from Sukhna Lake. Sponsored placement.', hi: 'सुखना झील से थोड़ी दूरी पर शांत कमरे। प्रायोजित लिस्टिंग।' },
      source: { name: 'Partner Hotel API (simulated)', ref: 'PHAPI/P-104/rates', checkedMins: 440 },
      providerSource: { name: 'Hotel Sukhna Greens channel manager (simulated)', price: 2200, rating: 4.2, availability: 'available', checkedMins: 440 },
      compare: cmp(2350, 2290, 2600) },
    { id: 'H-CDG-05', city: 'CDG', partnerId: 'P-105', name: 'Zirakpur Grand Residency', provider: 'Zirakpur Grand Residency', managed: 'partner', sponsored: false,
      price: 2400, basis: 'night', rating: 3.9, reviews: 301, distanceKm: 5.6, area: 'Zirakpur, 5.6 km from CDG',
      checkIn: '12:00', checkOut: '11:00', availability: 'available', left: 6, tags: ['family', 'parking'],
      policy: { fullUntilH: 72, thenPct: 0 },
      desc: { en: 'Larger rooms with parking, on the highway side of the tricity.', hi: 'पार्किंग के साथ बड़े कमरे, ट्राइसिटी के हाईवे की ओर।' },
      source: { name: 'Partner Hotel API (simulated)', ref: 'PHAPI/P-105/rates', checkedMins: 55 },
      providerSource: { name: 'Zirakpur Grand front-desk sheet (simulated)', price: 2400, rating: null, availability: 'available', checkedMins: 48 },
      compare: cmp(2550, 2480) },
    { id: 'H-CDG-06', city: 'CDG', partnerId: 'P-106', name: 'The Rose Petal Suites', provider: 'The Rose Petal Suites', managed: 'partner', sponsored: false,
      price: 2950, basis: 'night', rating: 4.5, reviews: 876, distanceKm: 4.9, area: 'Sector 16, 4.9 km from CDG',
      checkIn: '14:00', checkOut: '12:00', availability: 'available', left: 3, tags: ['family', 'garden', 'freeCancel'],
      policy: { fullUntilH: 24, thenPct: 0 },
      desc: { en: 'Boutique suites near the Rose Garden.', hi: 'रोज़ गार्डन के पास बुटीक सुइट्स।' },
      source: { name: 'Partner Hotel API (simulated)', ref: 'PHAPI/P-106/rates', checkedMins: 95 },
      providerSource: { name: 'The Rose Petal Suites booking engine (simulated)', price: 2950, rating: 4.5, availability: 'soldout', checkedMins: 4 },
      compare: cmp(3100, 3050) },
    { id: 'H-CDG-07', city: 'CDG', partnerId: 'P-107', name: 'Hotel Capitol Heights', provider: 'Hotel Capitol Heights', managed: 'partner', sponsored: true,
      price: 4200, basis: 'night', rating: 4.6, reviews: 1120, distanceKm: 7.2, area: 'Sector 35, 7.2 km from CDG',
      checkIn: '14:00', checkOut: '12:00', availability: 'available', left: 8, tags: ['family', 'pool', 'freeCancel'],
      policy: { fullUntilH: 24, thenPct: 0 },
      desc: { en: 'Upscale hotel with pool. Sponsored placement.', hi: 'पूल वाला प्रीमियम होटल। प्रायोजित लिस्टिंग।' },
      source: { name: 'Partner Hotel API (simulated)', ref: 'PHAPI/P-107/rates', checkedMins: 18 },
      providerSource: { name: 'Hotel Capitol Heights CRS (simulated)', price: 4200, rating: 4.6, availability: 'available', checkedMins: 15 },
      compare: cmp(4450, 4390, 4800) },

    /* Madurai (Tamil scenario, budget ₹2,000) */
    { id: 'H-MDU-01', city: 'MDU', partnerId: 'P-111', name: 'Meenakshi Residency', provider: 'Meenakshi Residency', managed: 'partner', sponsored: false,
      price: 1850, basis: 'night', rating: 4.3, reviews: 954, distanceKm: 0.6, area: 'West Veli St, 0.6 km from MDU',
      checkIn: '12:00', checkOut: '11:00', earlyCheckIn: { fee: 400 }, availability: 'available', left: 3, tags: ['veg', 'temple', 'nearStation', 'freeCancel', 'senior'],
      policy: { fullUntilH: 24, thenPct: 50 },
      desc: { en: 'Pure-veg, lift, 1.2 km walk to Meenakshi Amman Temple. Senior-friendly rooms.', hi: 'शुद्ध शाकाहारी, लिफ्ट, मीनाक्षी अम्मन मंदिर 1.2 किमी। बुज़ुर्गों के अनुकूल कमरे।', ta: 'சைவ உணவகம், லிஃப்ட், மீனாட்சி அம்மன் கோயில் 1.2 கி.மீ. மூத்தோருக்கு ஏற்ற அறைகள்.' },
      source: { name: 'Partner Hotel API (simulated)', ref: 'PHAPI/P-111/rates', checkedMins: 20 },
      providerSource: { name: 'Meenakshi Residency rate sheet (simulated)', price: 1850, rating: 4.3, availability: 'available', checkedMins: 14 },
      compare: cmp(1990, 2050, 2200) },
    { id: 'H-MDU-02', city: 'MDU', partnerId: 'P-112', name: 'Temple View Lodge', provider: 'Temple View Lodge', managed: 'partner', sponsored: false,
      price: 1450, basis: 'night', rating: 4.0, reviews: 410, distanceKm: 1.1, area: 'Town Hall Rd, 1.1 km from MDU',
      checkIn: '12:00', checkOut: '11:00', availability: 'available', left: 5, tags: ['veg', 'temple', 'budget'],
      policy: { fullUntilH: 48, thenPct: 0 },
      desc: { en: 'Simple rooms with a rooftop temple view.', hi: 'छत से मंदिर का दृश्य, साधारण कमरे।', ta: 'மொட்டை மாடியிலிருந்து கோயில் காட்சி, எளிய அறைகள்.' },
      source: { name: 'Partner Hotel API (simulated)', ref: 'PHAPI/P-112/rates', checkedMins: 380 },
      providerSource: { name: 'Temple View Lodge sheet (simulated)', price: 1450, rating: 4.0, availability: 'available', checkedMins: 380 },
      compare: cmp(1600, 1550) },
    { id: 'H-MDU-03', city: 'MDU', partnerId: 'P-113', name: 'Retiring Room, Madurai Jn (sample)', provider: 'IRCTC (sample)', managed: 'irctc', sponsored: false,
      price: 990, basis: 'night', rating: 3.8, reviews: 1630, distanceKm: 0.1, area: 'Platform 1, Madurai Jn',
      checkIn: '05:30', checkOut: '17:30', availability: 'few', left: 1, tags: ['nearStation', 'budget'],
      policy: { fullUntilH: 24, thenPct: 50 },
      desc: { en: 'Book by the slot right inside the station: no waiting after an early arrival.', hi: 'स्टेशन के अंदर स्लॉट के हिसाब से कमरा: सुबह पहुँचने पर इंतज़ार नहीं।', ta: 'நிலையத்துக்குள்ளேயே நேர அடிப்படையில் அறை: அதிகாலை வந்தாலும் காத்திருக்க வேண்டாம்.' },
      source: { name: 'IRCTC retiring-room catalogue (sample)', ref: 'IRCTC-RR/MDU', checkedMins: 30 },
      providerSource: { name: 'IRCTC retiring-room inventory (sample)', price: 990, rating: 3.8, availability: 'few', checkedMins: 22 },
      compare: cmp(1100, 1050) },
    { id: 'H-MDU-04', city: 'MDU', partnerId: 'P-114', name: 'Vaigai Grand', provider: 'Vaigai Grand', managed: 'partner', sponsored: true,
      price: 2600, basis: 'night', rating: 4.4, reviews: 702, distanceKm: 3.2, area: 'KK Nagar, 3.2 km from MDU',
      checkIn: '14:00', checkOut: '12:00', availability: 'available', left: 4, tags: ['family', 'pool'],
      policy: { fullUntilH: 24, thenPct: 0 },
      desc: { en: 'Business hotel with pool. Sponsored placement.', hi: 'पूल वाला बिज़नेस होटल। प्रायोजित।', ta: 'நீச்சல் குளத்துடன் வணிக விடுதி. விளம்பர இடம்.' },
      source: { name: 'Partner Hotel API (simulated)', ref: 'PHAPI/P-114/rates', checkedMins: 16 },
      providerSource: { name: 'Vaigai Grand CRS (simulated)', price: 2750, rating: 4.4, availability: 'available', checkedMins: 7 },
      compare: cmp(2790, 2700) },

    /* Puri (Bengali scenario, budget ₹2,500) */
    { id: 'H-PURI-01', city: 'PURI', partnerId: 'P-121', name: 'Sea Breeze Puri', provider: 'Sea Breeze Puri', managed: 'partner', sponsored: false,
      price: 2200, basis: 'night', rating: 4.2, reviews: 1180, distanceKm: 1.8, area: 'Chakratirtha Rd, 1.8 km from PURI',
      checkIn: '12:00', checkOut: '10:00', earlyCheckIn: { fee: 400 }, availability: 'available', left: 3, tags: ['family', 'beach', 'freeCancel'],
      policy: { fullUntilH: 48, thenPct: 50 },
      desc: { en: 'Sea-facing family rooms, Bengali and Odia menu.', hi: 'समुद्र की ओर फैमिली रूम, बंगाली और ओड़िया खाना।', bn: 'সমুদ্রমুখী পারিবারিক ঘর, বাঙালি ও ওড়িয়া খাবার।' },
      source: { name: 'Partner Hotel API (simulated)', ref: 'PHAPI/P-121/rates', checkedMins: 22 },
      providerSource: { name: 'Sea Breeze Puri rate sheet (simulated)', price: 2200, rating: 4.2, availability: 'available', checkedMins: 10 },
      compare: cmp(2400, 2350, 2600) },
    { id: 'H-PURI-02', city: 'PURI', partnerId: 'P-122', name: 'Jagannath Dham Bhavan', provider: 'Jagannath Dham Bhavan', managed: 'partner', sponsored: false,
      price: 1600, basis: 'night', rating: 4.1, reviews: 660, distanceKm: 2.4, area: 'Grand Road, 2.4 km from PURI',
      checkIn: '10:00', checkOut: '09:00', availability: 'available', left: 6, tags: ['veg', 'temple', 'budget', 'family'],
      policy: { fullUntilH: 24, thenPct: 0 },
      desc: { en: 'Walk to the Jagannath Temple; vegetarian kitchen.', hi: 'जगन्नाथ मंदिर पैदल दूरी पर; शाकाहारी रसोई।', bn: 'জগন্নাথ মন্দির হাঁটা পথে; নিরামিষ রান্নাঘর।' },
      source: { name: 'Partner Hotel API (simulated)', ref: 'PHAPI/P-122/rates', checkedMins: 35 },
      providerSource: { name: 'Jagannath Dham Bhavan desk (simulated)', price: 1600, rating: 4.1, availability: 'available', checkedMins: 28 },
      compare: cmp(1750, 1700) },
    { id: 'H-PURI-03', city: 'PURI', partnerId: 'P-123', name: 'Swargadwar Inn', provider: 'Swargadwar Inn', managed: 'partner', sponsored: false,
      price: 2450, basis: 'night', rating: 4.0, reviews: 288, distanceKm: 3.1, area: 'Swargadwar, 3.1 km from PURI',
      checkIn: '12:00', checkOut: '11:00', availability: 'available', left: 2, tags: ['beach'],
      policy: null,
      desc: { en: 'Beach-side inn. Cancellation terms not published.', hi: 'समुद्र तट के पास। रद्दीकरण नियम प्रकाशित नहीं।', bn: 'সমুদ্রতটের কাছে। বাতিলের নিয়ম প্রকাশিত নয়।' },
      source: { name: 'Partner Hotel API (simulated)', ref: 'PHAPI/P-123/rates', checkedMins: 60 },
      providerSource: { name: 'Swargadwar Inn sheet (simulated)', price: 2450, rating: 4.0, availability: 'available', checkedMins: 50 },
      compare: cmp(2600, 2550) }
  ];

  /* ---------- Cabs / transfers ---------- */
  var cabs = [
    { id: 'C-CDG-01', city: 'CDG', partnerId: 'P-201', name: 'Station → hotel sedan transfer', provider: 'Tricity Cabs', managed: 'partner', sponsored: false,
      price: 350, basis: 'trip', rating: 4.5, reviews: 3120, durationMin: 20, vehicle: 'Sedan · 4 seats · boot space', meet: 'Waits at CDG Gate 1 with name board, 15 min after arrival',
      availability: 'available', tags: ['luggage', 'nearStation', 'freeCancel'], policy: { fullUntilH: 1, thenPct: 0 }, offsetMin: 15,
      desc: { en: 'Tracks your train: pickup shifts if 12011 runs late (sample rule).', hi: 'आपकी ट्रेन ट्रैक करता है: 12011 देर से आए तो पिकअप भी आगे (सैंपल नियम)।' },
      source: { name: 'Cab partner feed (simulated)', ref: 'CABS/P-201/CDG-T1', checkedMins: 8 },
      providerSource: { name: 'Tricity Cabs dispatch (simulated)', price: 350, rating: 4.5, availability: 'available', checkedMins: 5 },
      compare: cmp(420, 390, 500) },
    { id: 'C-CDG-02', city: 'CDG', partnerId: 'P-202', name: 'GreenRide EV transfer', provider: 'GreenRide EV', managed: 'partner', sponsored: false,
      price: 320, basis: 'trip', rating: 4.3, reviews: 870, durationMin: 22, vehicle: 'Electric hatchback · 4 seats · small boot', meet: 'Pickup at CDG parking bay B',
      availability: 'available', tags: ['ev', 'freeCancel'], policy: { fullUntilH: 1, thenPct: 0 }, offsetMin: 20,
      desc: { en: 'Electric cab. Limited boot space for large suitcases.', hi: 'इलेक्ट्रिक कैब। बड़े सूटकेस के लिए कम जगह।' },
      source: { name: 'Cab partner feed (simulated)', ref: 'CABS/P-202/CDG-T1', checkedMins: 10 },
      providerSource: { name: 'GreenRide dispatch (simulated)', price: 320, rating: 4.3, availability: 'available', checkedMins: 7 },
      compare: cmp(380, 360) },
    { id: 'C-CDG-03', city: 'CDG', mode: 'auto', meter: true, partnerId: 'P-203', name: 'Prepaid auto-rickshaw (station booth)', provider: 'CDG Prepaid Auto Booth (sample)', managed: 'irctc', sponsored: false,
      price: 150, basis: 'trip', rating: 3.9, reviews: 540, durationMin: 25, vehicle: 'Auto · 3 seats', meet: 'Prepaid booth outside the main exit',
      availability: 'available', tags: ['budget', 'nearStation'], policy: { fullUntilH: 0, thenPct: 0 }, offsetMin: 10,
      desc: { en: 'Fixed fare from the station booth: pay at the booth or to the driver. No online booking (sample).', hi: 'स्टेशन बूथ से तय किराया: बूथ पर या ड्राइवर को भुगतान करें। ऑनलाइन बुकिंग नहीं (सैंपल)।' },
      source: { name: 'Station facilities list (sample)', ref: 'STN/CDG/prepaid', checkedMins: 90 },
      providerSource: { name: 'Booth tariff board (sample)', price: 150, rating: 3.9, availability: 'available', checkedMins: 85 },
      compare: cmp(190, 180) },
    { id: 'C-CDG-04', city: 'CDG', partnerId: 'P-201', name: 'Full-day city cab (8 h / 80 km)', provider: 'Tricity Cabs', managed: 'partner', sponsored: false,
      price: 2100, basis: 'trip', rating: 4.5, reviews: 3120, durationMin: 480, vehicle: 'Sedan · 4 seats', meet: 'Pickup from your hotel', slot: '09:30', day: 1,
      availability: 'available', tags: ['sightseeing', 'freeCancel'], policy: { fullUntilH: 12, thenPct: 50 },
      desc: { en: 'Rock Garden, Sukhna Lake and Rose Garden in one day.', hi: 'एक दिन में रॉक गार्डन, सुखना झील और रोज़ गार्डन।' },
      source: { name: 'Cab partner feed (simulated)', ref: 'CABS/P-201/CDG-8H', checkedMins: 14 },
      providerSource: { name: 'Tricity Cabs dispatch (simulated)', price: 2100, rating: 4.5, availability: 'available', checkedMins: 11 },
      compare: cmp(2400, 2300, 2600) },
    { id: 'C-CDG-05', city: 'CDG', partnerId: 'P-204', name: 'Kasauli day trip (SUV)', provider: 'Himalayan Trails Cabs', managed: 'partner', sponsored: false,
      price: 3400, basis: 'trip', rating: 4.4, reviews: 410, durationMin: 600, vehicle: 'SUV · 6 seats', meet: 'Pickup from your hotel', slot: '08:00', day: 1,
      availability: 'available', tags: ['hills', 'family'], policy: { fullUntilH: 24, thenPct: 0 },
      desc: { en: 'Hill day trip, about 1.5 h each way.', hi: 'पहाड़ों की एक दिन की यात्रा, एक तरफ़ लगभग 1.5 घंटे।' },
      source: { name: 'Cab partner feed (simulated)', ref: 'CABS/P-204/KSL', checkedMins: 410 },
      providerSource: { name: 'Himalayan Trails sheet (simulated)', price: 3400, rating: 4.4, availability: 'available', checkedMins: 410 },
      compare: cmp(3800, 3650) },

    { id: 'C-MDU-01', city: 'MDU', mode: 'auto', meter: true, partnerId: 'P-211', name: 'Station → hotel auto (prepaid)', provider: 'Madurai Prepaid Auto (sample)', managed: 'irctc', sponsored: false,
      price: 120, basis: 'trip', rating: 4.0, reviews: 760, durationMin: 10, vehicle: 'Auto · 3 seats', meet: 'Prepaid counter, east exit', offsetMin: 10,
      availability: 'available', tags: ['budget', 'nearStation', 'senior'], policy: { fullUntilH: 0, thenPct: 0 },
      desc: { en: 'Fixed fare paid at the counter; porter help available. No online booking.', hi: 'तय किराया; काउंटर पर कुली सहायता।', ta: 'நிர்ணயிக்கப்பட்ட கட்டணம்; கவுண்டரில் சுமை தூக்கும் உதவி.' },
      source: { name: 'Station facilities list (sample)', ref: 'STN/MDU/prepaid', checkedMins: 45 },
      providerSource: { name: 'Booth tariff board (sample)', price: 120, rating: 4.0, availability: 'available', checkedMins: 40 },
      compare: cmp(160, 150) },
    { id: 'C-MDU-02', city: 'MDU', partnerId: 'P-212', name: 'Temple circuit cab (6 h)', provider: 'Pandiyan Travels', managed: 'partner', sponsored: false,
      price: 1600, basis: 'trip', rating: 4.4, reviews: 520, durationMin: 360, vehicle: 'MUV · 6 seats', meet: 'Pickup from your hotel', slot: '15:30', day: 0,
      availability: 'available', tags: ['temple', 'senior', 'freeCancel'], policy: { fullUntilH: 6, thenPct: 50 },
      desc: { en: 'Thirupparankundram and Alagar Kovil with waiting time.', hi: 'तिरुप्परनकुंद्रम और अलगर कोविल, प्रतीक्षा सहित।', ta: 'திருப்பரங்குன்றம், அழகர் கோவில், காத்திருப்பு நேரத்துடன்.' },
      source: { name: 'Cab partner feed (simulated)', ref: 'CABS/P-212/TC6', checkedMins: 26 },
      providerSource: { name: 'Pandiyan Travels sheet (simulated)', price: 1600, rating: 4.4, availability: 'available', checkedMins: 20 },
      compare: cmp(1850, 1750) },

    { id: 'C-PURI-01', city: 'PURI', mode: 'auto', meter: true, partnerId: 'P-221', name: 'Station → hotel transfer (auto)', provider: 'Puri Station Auto Stand (sample)', managed: 'irctc', sponsored: false,
      price: 200, basis: 'trip', rating: 4.0, reviews: 380, durationMin: 15, vehicle: 'Auto · 3 seats', meet: 'Main exit auto stand', offsetMin: 10,
      availability: 'available', tags: ['budget', 'nearStation'], policy: { fullUntilH: 0, thenPct: 0 },
      desc: { en: 'Fixed fare to the Chakratirtha Road hotels, paid to the driver. No online booking.', hi: 'चक्रतीर्थ रोड होटलों तक तय किराया।', bn: 'চক্রতীর্থ রোডের হোটেল পর্যন্ত নির্দিষ্ট ভাড়া।' },
      source: { name: 'Station facilities list (sample)', ref: 'STN/PURI/auto', checkedMins: 50 },
      providerSource: { name: 'Stand tariff board (sample)', price: 200, rating: 4.0, availability: 'available', checkedMins: 44 },
      compare: cmp(260, 240) },
    { id: 'C-PURI-02', city: 'PURI', partnerId: 'P-222', name: 'Konark & Chandrabhaga day cab', provider: 'Kalinga Cabs', managed: 'partner', sponsored: false,
      price: 2200, basis: 'trip', rating: 4.5, reviews: 690, durationMin: 420, vehicle: 'SUV · 6 seats', meet: 'Pickup from your hotel', slot: '08:30', day: 1,
      availability: 'available', tags: ['family', 'heritage', 'freeCancel'], policy: { fullUntilH: 12, thenPct: 50 },
      desc: { en: 'Sun Temple at Konark plus Chandrabhaga beach.', hi: 'कोणार्क सूर्य मंदिर और चंद्रभागा तट।', bn: 'কোনারকের সূর্য মন্দির ও চন্দ্রভাগা সৈকত।' },
      source: { name: 'Cab partner feed (simulated)', ref: 'CABS/P-222/KNK', checkedMins: 19 },
      providerSource: { name: 'Kalinga Cabs dispatch (simulated)', price: 2200, rating: 4.5, availability: 'available', checkedMins: 12 },
      compare: cmp(2500, 2450, 2800) }
  ];

  /* ---------- Food (IRCTC e-catering style + destination meals) ---------- */
  var food = [
    { id: 'F-CDG-01', city: 'CDG', partnerId: 'IRCTC-EC', name: 'e-Catering veg thali, delivered to seat', provider: 'IRCTC e-Catering (sample)', managed: 'irctc', sponsored: false,
      price: 249, basis: 'person', rating: 4.1, reviews: 2890, onTrain: true, at: 'UMB', slot: '09:58', availability: 'available', tags: ['veg', 'onTrain'],
      policy: { fullUntilH: 2, thenPct: 0 },
      desc: { en: 'Optional add-on (Shatabdi fares already include basic meals). Delivered at Ambala Cantt (UMB) to C3.', hi: 'वैकल्पिक (शताब्दी किराये में सामान्य भोजन पहले से शामिल)। अंबाला छावनी (UMB) पर C3 में डिलीवरी।' },
      source: { name: 'IRCTC e-Catering menu (sample)', ref: 'ECAT/UMB/12011', checkedMins: 15 },
      providerSource: { name: 'Vendor kitchen confirmation (sample)', price: 249, rating: 4.1, availability: 'available', checkedMins: 10 },
      compare: cmp(279, 269) },
    { id: 'F-CDG-02', city: 'CDG', partnerId: 'P-301', name: 'Punjabi veg thali lunch (Sector 22)', provider: 'Pind Rasoi (sample)', managed: 'partner', sponsored: false,
      price: 420, basis: 'person', rating: 4.4, reviews: 1410, onTrain: false, slot: '13:00', distanceKm: 4.1, availability: 'available', tags: ['veg', 'family'],
      policy: { fullUntilH: 2, thenPct: 0 },
      desc: { en: 'Table reservation with a fixed thali; good time to fill the check-in gap.', hi: 'तय थाली के साथ टेबल बुकिंग; चेक-इन से पहले के खाली समय के लिए बढ़िया।' },
      source: { name: 'Restaurant partner feed (simulated)', ref: 'FOOD/P-301/thali', checkedMins: 33 },
      providerSource: { name: 'Pind Rasoi POS (simulated)', price: 420, rating: 4.4, availability: 'available', checkedMins: 21 },
      compare: cmp(460, 450, 480) },
    { id: 'F-CDG-03', city: 'CDG', partnerId: 'P-302', name: 'Satvik / Jain meal box (to hotel)', provider: 'Tiffin Ghar (sample)', managed: 'partner', sponsored: false,
      price: 320, basis: 'person', rating: 4.2, reviews: 390, onTrain: false, slot: '20:00', distanceKm: 2.0, availability: 'available', tags: ['veg', 'jain'],
      policy: { fullUntilH: 3, thenPct: 0 },
      desc: { en: 'No onion, no garlic. Delivered to your hotel at dinner time.', hi: 'बिना प्याज़-लहसुन। रात के खाने पर होटल में डिलीवरी।' },
      source: { name: 'Restaurant partner feed (simulated)', ref: 'FOOD/P-302/jain', checkedMins: 41 },
      providerSource: { name: 'Tiffin Ghar order book (simulated)', price: 320, rating: 4.2, availability: 'available', checkedMins: 36 },
      compare: cmp(360, 350) },

    { id: 'F-MDU-01', city: 'MDU', partnerId: 'P-311', name: 'South Indian veg breakfast & meals', provider: 'Sri Annapoorna Mess (sample)', managed: 'partner', sponsored: false,
      price: 180, basis: 'person', rating: 4.5, reviews: 2100, onTrain: false, slot: '07:30', distanceKm: 0.8, availability: 'available', tags: ['veg', 'temple'],
      policy: { fullUntilH: 2, thenPct: 0 },
      desc: { en: 'Idli, pongal and filter coffee near the temple.', hi: 'मंदिर के पास इडली, पोंगल और फ़िल्टर कॉफ़ी।', ta: 'கோயில் அருகே இட்லி, பொங்கல், ஃபில்டர் காபி.' },
      source: { name: 'Restaurant partner feed (simulated)', ref: 'FOOD/P-311/bf', checkedMins: 27 },
      providerSource: { name: 'Mess counter board (sample)', price: 180, rating: 4.5, availability: 'available', checkedMins: 24 },
      compare: cmp(210, 200) },
    { id: 'F-PURI-01', city: 'PURI', partnerId: 'P-321', name: 'Odia & Bengali home-style thali', provider: 'Dalma House (sample)', managed: 'partner', sponsored: false,
      price: 220, basis: 'person', rating: 4.3, reviews: 860, onTrain: false, slot: '13:00', distanceKm: 1.5, availability: 'available', tags: ['family'],
      policy: { fullUntilH: 2, thenPct: 0 },
      desc: { en: 'Dalma, fish curry or veg options, rice and khaja.', hi: 'दालमा, मछली करी या शाकाहारी विकल्प, चावल और खाजा।', bn: 'ডালমা, মাছের ঝোল বা নিরামিষ, ভাত আর খাজা।' },
      source: { name: 'Restaurant partner feed (simulated)', ref: 'FOOD/P-321/thali', checkedMins: 29 },
      providerSource: { name: 'Dalma House POS (simulated)', price: 220, rating: 4.3, availability: 'available', checkedMins: 18 },
      compare: cmp(250, 240) }
  ];

  /* ---------- Sightseeing & station services ---------- */
  var sights = [
    { id: 'S-CDG-01', city: 'CDG', partnerId: 'CHD-TOUR', name: 'Rock Garden of Chandigarh', provider: 'Chandigarh Tourism (sample listing)', managed: 'partner', sponsored: false,
      price: 30, basis: 'person', rating: 4.6, reviews: 15400, slot: '11:45', durationMin: 90, distanceKm: 6.0, availability: 'available', tags: ['heritage', 'family', 'gapFill'],
      policy: { fullUntilH: 0, thenPct: 0 },
      desc: { en: 'Fits the gap between arrival and check-in if you drop bags at the cloakroom first.', hi: 'अगर पहले क्लोकरूम में सामान रख दें, तो आगमन और चेक-इन के बीच का समय इसमें लग जाएगा।' },
      source: { name: 'Tourism listing (sample)', ref: 'TOUR/CHD/rock-garden', checkedMins: 120 },
      providerSource: { name: 'Ticket counter board (sample)', price: 30, rating: 4.6, availability: 'available', checkedMins: 110 },
      compare: cmp(30, 30) },
    { id: 'S-CDG-02', city: 'CDG', partnerId: 'P-401', name: 'Sukhna Lake pedal boat (30 min)', provider: 'Lake Boat Club (sample)', managed: 'partner', sponsored: false,
      price: 150, basis: 'person', rating: 4.3, reviews: 6200, slot: '17:00', durationMin: 60, distanceKm: 8.0, availability: 'available', tags: ['family', 'lake'],
      policy: null,
      desc: { en: 'Sunset boating. Cancellation terms not published by the provider.', hi: 'सूर्यास्त पर नौका विहार। प्रदाता ने रद्दीकरण नियम प्रकाशित नहीं किए।' },
      source: { name: 'Activity partner feed (simulated)', ref: 'ACT/P-401/boat', checkedMins: 75 },
      providerSource: { name: 'Boat club counter (sample)', price: 150, rating: 4.3, availability: 'available', checkedMins: 70 },
      compare: cmp(180, 170) },
    { id: 'S-CDG-03', city: 'CDG', partnerId: 'P-402', name: 'Le Corbusier heritage walk (guided)', provider: 'City Heritage Walks (sample)', managed: 'partner', sponsored: false,
      price: 600, basis: 'person', rating: 4.7, reviews: 830, slot: '09:00', day: 1, durationMin: 150, distanceKm: 7.5, availability: 'few', tags: ['heritage', 'freeCancel'],
      policy: { fullUntilH: 48, thenPct: 50 },
      desc: { en: 'Capitol Complex and Sector 17 with a licensed guide.', hi: 'लाइसेंसधारी गाइड के साथ कैपिटल कॉम्प्लेक्स और सेक्टर 17।' },
      source: { name: 'Activity partner feed (simulated)', ref: 'ACT/P-402/walk', checkedMins: 52 },
      providerSource: { name: 'Heritage Walks booking sheet (simulated)', price: 600, rating: 4.7, availability: 'few', checkedMins: 40 },
      compare: cmp(700, 650, 750) },
    { id: 'S-CDG-04', city: 'CDG', partnerId: 'IRCTC-CLK', name: 'Station cloakroom (luggage, per bag/day)', provider: 'Indian Railways cloakroom, CDG (sample)', managed: 'irctc', sponsored: false, service: 'cloakroom',
      price: 30, basis: 'bag', rating: null, reviews: 0, slot: '11:15', durationMin: 0, distanceKm: 0, availability: 'available', tags: ['gapFill', 'nearStation'],
      policy: { fullUntilH: 0, thenPct: 100 },
      desc: { en: 'Leave bags at the station, explore, collect them before check-in (sample tariff).', hi: 'सामान स्टेशन पर रखें, घूमें, चेक-इन से पहले ले लें (सैंपल दर)।' },
      source: { name: 'Station facilities list (sample)', ref: 'STN/CDG/cloakroom', checkedMins: 60 },
      providerSource: { name: 'Cloakroom tariff board (sample)', price: 30, rating: null, availability: 'available', checkedMins: 60, ratingNotApplicable: true },
      compare: [] },

    { id: 'S-MDU-01', city: 'MDU', partnerId: 'HR-CE', name: 'Meenakshi Amman Temple darshan', provider: 'Temple administration (sample listing)', managed: 'partner', sponsored: false,
      price: 0, basis: 'person', rating: 4.8, reviews: 52000, slot: '06:30', durationMin: 120, distanceKm: 1.2, availability: 'available', tags: ['temple', 'heritage', 'senior'],
      policy: { fullUntilH: 0, thenPct: 0 },
      desc: { en: 'Free general darshan; special entry at counter. Morning darshan before the heat.', hi: 'सामान्य दर्शन निःशुल्क; विशेष प्रवेश काउंटर पर। गर्मी से पहले सुबह दर्शन।', ta: 'பொது தரிசனம் இலவசம்; சிறப்பு நுழைவு கவுண்டரில். வெயிலுக்கு முன் காலை தரிசனம்.' },
      source: { name: 'Temple timings listing (sample)', ref: 'TOUR/MDU/meenakshi', checkedMins: 140 },
      providerSource: { name: 'Temple notice board (sample)', price: 0, rating: 4.8, availability: 'available', checkedMins: 130 },
      compare: [] },
    { id: 'S-MDU-02', city: 'MDU', partnerId: 'TN-ASI', name: 'Thirumalai Nayakkar Mahal', provider: 'State archaeology (sample listing)', managed: 'partner', sponsored: false,
      price: 50, basis: 'person', rating: 4.4, reviews: 9800, slot: '10:30', durationMin: 75, distanceKm: 2.0, availability: 'available', tags: ['heritage', 'family'],
      policy: { fullUntilH: 0, thenPct: 0 },
      desc: { en: '17th-century palace; evening sound-and-light show (sample).', hi: '17वीं सदी का महल; शाम को लाइट एंड साउंड शो (सैंपल)।', ta: '17ஆம் நூற்றாண்டு அரண்மனை; மாலை ஒலி-ஒளி காட்சி (மாதிரி).' },
      source: { name: 'Heritage listing (sample)', ref: 'TOUR/MDU/mahal', checkedMins: 95 },
      providerSource: { name: 'Ticket counter board (sample)', price: 50, rating: 4.4, availability: 'available', checkedMins: 90 },
      compare: [] },
    { id: 'S-PURI-01', city: 'PURI', partnerId: 'SJTA', name: 'Shree Jagannath Temple visit', provider: 'Temple administration (sample listing)', managed: 'partner', sponsored: false,
      price: 0, basis: 'person', rating: 4.8, reviews: 61000, slot: '07:30', day: 0, durationMin: 120, distanceKm: 2.6, availability: 'available', tags: ['temple', 'heritage', 'family'],
      policy: { fullUntilH: 0, thenPct: 0 },
      desc: { en: 'No entry fee. Phones and leather items are not allowed inside (sample note).', hi: 'प्रवेश निःशुल्क। मोबाइल और चमड़े का सामान अंदर ले जाना मना (सैंपल नोट)।', bn: 'প্রবেশ বিনামূল্যে। ভেতরে মোবাইল ও চামড়ার জিনিস নিষেধ (নমুনা তথ্য)।' },
      source: { name: 'Temple timings listing (sample)', ref: 'TOUR/PURI/sjt', checkedMins: 150 },
      providerSource: { name: 'Temple notice board (sample)', price: 0, rating: 4.8, availability: 'available', checkedMins: 140 },
      compare: [] },
    { id: 'S-PURI-02', city: 'PURI', partnerId: 'ASI', name: 'Konark Sun Temple entry', provider: 'ASI ticketing (sample listing)', managed: 'partner', sponsored: false,
      price: 40, basis: 'person', rating: 4.7, reviews: 33000, slot: '10:00', day: 1, durationMin: 120, distanceKm: 35, availability: 'available', tags: ['heritage', 'family'],
      policy: { fullUntilH: 0, thenPct: 0 },
      desc: { en: 'UNESCO site, about 1 h from Puri. Pair with the Konark day cab.', hi: 'यूनेस्को धरोहर, पुरी से लगभग 1 घंटा। कोणार्क डे कैब के साथ लें।', bn: 'ইউনেস্কো ঐতিহ্য, পুরী থেকে প্রায় ১ ঘণ্টা। কোনারক ডে ক্যাবের সঙ্গে নিন।' },
      source: { name: 'Heritage ticketing listing (sample)', ref: 'ASI/KNK', checkedMins: 85 },
      providerSource: { name: 'ASI counter board (sample)', price: 40, rating: 4.7, availability: 'available', checkedMins: 80 },
      compare: [] }
  ];

  /* ---------- Policy documents the Customer Support agent retrieves from (RAG-style, sample) ---------- */
  var policies = [
    { id: 'POL-1', title: 'OneTrip cancellation & refund policy §1 (sample)', topic: 'cancel',
      text: 'Each partner sets its own cancellation window. OneTrip shows it on every card and applies it exactly. Free-cancellation items are refunded 100% inside the window.' },
    { id: 'POL-2', title: 'OneTrip cancellation & refund policy §2 (sample)', topic: 'refund',
      text: 'Refunds go back to the original payment source. Partner Bank (sample) processes them in 5–7 working days for UPI and cards. The partner owns the refund decision; the bank owns money movement.' },
    { id: 'POL-3', title: 'Train ticket rules (sample summary)', topic: 'train',
      text: 'Your train ticket is booked and refunded on IRCTC under railway rules. OneTrip never changes or re-charges the ticket. Use IRCTC to cancel the ticket.' },
    { id: 'POL-4', title: 'Support & escalation (sample)', topic: 'human',
      text: 'If the assistant cannot resolve a query, or a translation is uncertain, it creates a ticket for a human agent. First response target: 2 hours (sample).' },
    { id: 'POL-5', title: 'Early check-in (sample)', topic: 'checkin',
      text: 'Early check-in depends on room availability. The hotel must confirm it. Until then OneTrip shows it as Needs confirmation and suggests the station cloakroom.' }
  ];

  var all = [].concat(
    hotels.map(function (x) { x.type = 'hotel'; return x; }),
    cabs.map(function (x) { x.type = 'cab'; return x; }),
    food.map(function (x) { x.type = 'food'; return x; }),
    sights.map(function (x) { x.type = 'sight'; return x; })
  );
  // Resolve relative "checked N minutes ago" to timestamps.
  all.forEach(function (x) {
    x.simulated = true;
    x.source.checkedAt = ago(x.source.checkedMins);
    x.providerSource.checkedAt = ago(x.providerSource.checkedMins);
  });
  var byId = {};
  all.forEach(function (x) { byId[x.id] = x; });

  OT.data.travel = {
    simulated: true,
    staleHours: 6,
    stations: stations,
    trains: trains,
    scenarios: scenarios,
    hotels: hotels,
    cabs: cabs,
    food: food,
    sights: sights,
    policies: policies,
    all: all,
    get: function (id) {
      if (byId[id] || !id) return byId[id];
      // v1.2: after a reload, lazily generated listings are not in memory yet -> rebuild them on demand
      var m = /^[HCFS]-([A-Z]+)-\d+$/.exec(id);
      if (m && OT.data.travel.ensureCity) { OT.data.travel.ensureCity(m[1]); if (byId[id]) return byId[id]; }
      var tx = OT.store && OT.store.get('txItems');           // local-transport legs persisted when they were offered
      if (tx && tx[id]) { OT.data.travel.addItems([JSON.parse(JSON.stringify(tx[id]))]); return byId[id]; }
      return undefined;
    },
    /** Register generated catalogue items (any-city listings, v1.1). */
    addItems: function (items) {
      items.forEach(function (x) {
        if (byId[x.id]) return;
        x.simulated = true;
        x.source.checkedAt = x.source.checkedAt || ago(x.source.checkedMins);
        x.providerSource.checkedAt = x.providerSource.checkedAt || ago(x.providerSource.checkedMins);
        all.push(x); byId[x.id] = x;
        (x.type === 'hotel' ? hotels : x.type === 'cab' ? cabs : x.type === 'food' ? food : sights).push(x);
      });
    },
    byCity: function (city, type) {
      return all.filter(function (x) { return x.city === city && (!type || x.type === type); });
    },
    stationName: function (code, lang) {
      var s = stations[code];
      if (!s) return code;
      return s.names[lang] || s.names.en;
    },
    /** Trip date: 13 days from today, so cancellation windows stay meaningful on any demo day. */
    defaultDate: function () { var d = new Date(); d.setDate(d.getDate() + 13); return ymd(d); },
    addDays: function (dateStr, n) { var p = dateStr.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return ymd(d); },
    scenarioFor: function (to) { return scenarios[to] || null; },
    findPnr: function (pnr) {
      pnr = String(pnr || '').replace(/\D/g, '');
      for (var k in scenarios) { if (scenarios[k].pnr === pnr) return scenarios[k]; }
      return null;
    },
    /** Build a fresh journey object (store 'journey' shape from ARCHITECTURE.md). */
    makeJourney: function (key, opts) {
      opts = opts || {};
      var sc = scenarios[key] || scenarios.CDG;
      var t = trains[sc.trainNo], r = trains[sc.returnNo];
      var date = opts.date || OT.data.travel.defaultDate();
      var arrDate = OT.data.travel.addDays(date, t.arrOffset);
      var pax = Math.max(1, Math.min(6, +opts.passengers || sc.passengers));
      var seats = sc.seats.slice(0, pax);
      while (seats.length < pax) seats.push(String(+seats[seats.length - 1] + 1));
      return {
        id: OT.uid('JRN'), scenario: sc.key, pnr: sc.pnr, simulated: true,
        train: { no: t.no, name: t.name, from: t.from, fromName: stations[t.from].names.en, to: t.to, toName: stations[t.to].names.en,
          date: date, dep: t.dep, arr: t.arr, arrDate: arrDate, cls: t.cls, coach: sc.coach, seats: seats, status: 'CNF', fare: t.farePerPax * pax },
        returnTrain: null,
        returnOption: { no: r.no, name: r.name, from: r.from, to: r.to, date: OT.data.travel.addDays(arrDate, sc.nights), dep: r.dep, arr: r.arr, pnr: sc.returnPnr, cls: r.cls },
        passengers: pax, budget: +opts.budget || sc.budget, nights: sc.nights,
        prefs: opts.prefs || JSON.parse(JSON.stringify(sc.prefs)),
        items: [], createdAt: new Date().toISOString()
      };
    }
  };
})();
