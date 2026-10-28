// Zarea AI — deterministic trading assistant over the live marketplace database.
// Understands English and common Roman-Urdu terms. Returns structured replies the client renders safely.
// An LLM can be plugged in later behind the same {text, table, links} contract.

const SYNONYMS = {
  sarya: 'steel', saria: 'steel', rebar: 'steel', 'steel bar': 'steel', girder: 'steel',
  cheeni: 'sugar', chini: 'sugar', gandum: 'wheat', chawal: 'rice', makai: 'maize', corn: 'maize', makki: 'maize',
  koyla: 'coal', koila: 'coal', ret: 'sand', rait: 'sand', bajri: 'crush', eent: 'bricks', int: 'bricks', brick: 'bricks',
  khaad: 'fertilizer', khad: 'fertilizer', husk: 'rice husk', bhoosa: 'wheat straw', toori: 'wheat straw',
  panel: 'solar', panels: 'solar', diesel: 'high speed diesel', cement: 'cement', siment: 'cement',
};

const CATEGORY_WORDS = {
  cement: 'cement', steel: 'steel', coal: 'coal', sugar: 'sugar', fertilizer: 'fertilizer', urea: 'fertilizer', dap: 'fertilizer',
  solar: 'solar', seed: 'seed', chemicals: 'chemicals', cotton: 'cotton-and-yarn', yarn: 'cotton-and-yarn',
  biomass: 'agriculture-biomass', grains: 'grains-and-pulses', sand: 'building-and-finishing', crush: 'building-and-finishing', bricks: 'building-and-finishing',
};

const fmt = (n) => `Rs ${Number(n).toLocaleString('en-PK')}`;
const pct = (v) => (v > 0 ? `▲ ${v}%` : v < 0 ? `▼ ${Math.abs(v)}%` : '— 0%');

function normalise(msg) {
  let m = ` ${msg.toLowerCase().replace(/[^a-z0-9\s.\-]/g, ' ')} `;
  for (const [k, v] of Object.entries(SYNONYMS)) m = m.replace(new RegExp(`\\s${k}\\s`, 'g'), ` ${v} `);
  return m.replace(/\s+/g, ' ').trim();
}

function findProducts(db, m) {
  const all = db.prepare("SELECT id, slug, name, category, brand, unit, price, city FROM products WHERE status='active'").all();
  const words = m.split(' ').filter((w) => w.length > 2);
  const scored = all.map((p) => {
    const hay = `${p.name} ${p.brand || ''} ${p.category}`.toLowerCase();
    let s = 0;
    for (const w of words) if (hay.includes(w)) s += w.length > 4 ? 2 : 1;
    if (p.brand && m.includes(p.brand.toLowerCase())) s += 4;
    return { p, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  if (!scored.length) return [];
  const top = scored[0].s;
  return scored.filter((x) => x.s >= Math.max(1, top - 1)).map((x) => x.p);
}

function findCategory(m) {
  for (const [w, c] of Object.entries(CATEGORY_WORDS)) if (new RegExp(`\\b${w}\\b`).test(m)) return c;
  return null;
}

function findCities(m, CITIES) {
  return Object.keys(CITIES).map((c) => ({ c, i: m.indexOf(c.toLowerCase()) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i).map((x) => x.c);
}

const SUGGEST = [
  'Cement price in Lahore', 'Compare Lucky vs Maple Leaf', 'Cheapest steel', 'Freight Karachi to Lahore 20 tons',
  'Material for 2000 sqft house', 'Credit requirements', 'Track ZR-DEMO01',
];

export function answer(raw, { db, priceStats, freightQuote, unitKg, CITIES, user }) {
  const m = normalise(raw);

  if (/^(hi|hello|salam|assalam|aoa|hey)\b/.test(m)) {
    return { text: `Wa alaikum assalam${user ? `, ${user.name.split(' ')[0]}` : ''}! I'm Zarea AI. I can quote live prices, compare brands, estimate freight and building material, explain credit, and track orders.`, suggestions: SUGGEST };
  }

  // Order tracking
  const ref = raw.toUpperCase().match(/ZR-[A-Z0-9]{4,16}/);
  if (ref) {
    const o = db.prepare('SELECT id, ref, status, delivery_city, delivery_date FROM orders WHERE ref = ?').get(ref[0]);
    if (!o) return { text: `I couldn't find order ${ref[0]}. Check the reference on your confirmation.` };
    const ev = db.prepare('SELECT status, at FROM order_events WHERE order_id = ? ORDER BY at, id').all(o.id);
    return {
      text: `Order ${o.ref} is **${o.status}**, delivering to ${o.delivery_city}${o.delivery_date ? ` (planned ${o.delivery_date})` : ''}.`,
      table: { cols: ['Stage', 'Time'], rows: ev.map((e) => [e.status, e.at.slice(0, 16)]) },
      links: [{ label: 'Open tracking page', href: `/logistics?track=${o.ref}` }],
    };
  }

  // Construction estimate (BOQ)
  const area = m.match(/(\d[\d,]*)\s*(sq ?ft|sqft|square feet|square foot|sft)/);
  if (area) {
    const sqft = Number(area[1].replace(/,/g, ''));
    const cement = Math.round(sqft * 0.4), steelT = Math.round(sqft * 0.0035 * 10) / 10, bricks = Math.round(sqft * 22),
      sand = Math.round(sqft * 1.8), crush = Math.round(sqft * 1.35);
    const price = (slug) => db.prepare('SELECT price FROM products WHERE slug = ?').get(slug)?.price || 0;
    const rows = [
      ['Cement (OPC)', `${cement.toLocaleString()} bags`, fmt(cement * price('flying-cement-opc'))],
      ['Steel Grade 60', `${steelT} t`, fmt(Math.round(steelT * price('grade-60-steel-bar-12-mm')))],
      ['Bricks', `${bricks.toLocaleString()}`, fmt(Math.round((bricks / 1000) * price('red-bricks-awal')))],
      ['Sand', `${sand.toLocaleString()} cft`, fmt(sand * price('ravi-sand'))],
      ['Crush', `${crush.toLocaleString()} cft`, fmt(crush * price('sargodha-crush'))],
    ];
    return {
      text: `Rule-of-thumb grey-structure estimate for **${sqft.toLocaleString()} sq ft** covered area at today's lowest marketplace prices. Confirm quantities with your engineer.`,
      table: { cols: ['Material', 'Quantity', 'Est. cost'], rows },
      links: [{ label: 'Open project estimator & add to cart', href: `/boq?sqft=${sqft}` }],
    };
  }

  // Freight
  if (/freight|transport|truck|shipping|delivery cost|kiraya|bhara/.test(m)) {
    const cities = findCities(m, CITIES);
    if (cities.length < 2) return { text: 'Tell me both cities and the load, e.g. "freight Karachi to Lahore 20 tons".', links: [{ label: 'Freight calculator', href: '/logistics' }] };
    const t = m.match(/(\d+(?:\.\d+)?)\s*(ton|tons|tonne|t\b)/); const bags = m.match(/(\d+)\s*bags?/);
    const kg = t ? Number(t[1]) * 1000 : bags ? Number(bags[1]) * 50 : 10000;
    const q = freightQuote(cities[0], cities[1], kg);
    return {
      text: `${cities[0]} → ${cities[1]}: about **${q.km} km**, ~${q.hours} h. Best option for ${Math.round(kg / 100) / 10} t is **${q.best.trucks} × ${q.best.name}** at about **${fmt(q.best.cost)}**.`,
      table: { cols: ['Truck', 'Trucks', 'Estimate'], rows: q.options.map((o) => [o.name, o.trucks, fmt(o.cost)]) },
      links: [{ label: 'Book logistics', href: `/logistics?from=${cities[0]}&to=${cities[1]}&kg=${kg}` }],
    };
  }

  // Credit
  if (/credit|loan|finance|financing|udhaar|udhar|bnpl|pay later/.test(m)) {
    return {
      text: 'Zarea Credit gives verified businesses 30, 60 or 90-day terms on marketplace purchases — now across all categories, not only biomass. Check eligibility instantly; decisions within 72 hours.',
      table: { cols: ['Required document'], rows: [['Tax registration certificate (NTN)'], ['Company incorporation certificate'], ['12-month bank statement'], ['Post-dated cheque'], ['Credit request on letterhead']] },
      links: [{ label: 'Check eligibility', href: '/credit' }],
    };
  }

  if (/become a supplier|sell on zarea|register as supplier|supplier registration|list my product/.test(m)) {
    return { text: 'Suppliers join free, get a verified badge after KYC, receive RFQs from buyers and update prices that feed the national price board.', links: [{ label: 'Register as a supplier', href: '/suppliers' }] };
  }

  const cat = findCategory(m);
  let prods = findProducts(db, m).filter((p) => p.price != null);
  const city = findCities(m, CITIES)[0];

  // Compare
  if (/compare|vs|versus|difference/.test(m) && prods.length >= 2) {
    const rows = prods.slice(0, 5).map((p) => { const s = priceStats(p.id); return [p.name, `${fmt(p.price)} / ${p.unit}`, pct(s.d7), pct(s.d30), p.city]; });
    const cheapest = prods.slice(0, 5).reduce((a, b) => (b.price < a.price ? b : a));
    return { text: `Cheapest of these today is **${cheapest.name}** at ${fmt(cheapest.price)}.`, table: { cols: ['Product', 'Price', '7 days', '30 days', 'Ships from'], rows } };
  }

  // Cheapest in category
  if (/cheap|cheapest|lowest|sasta|best price|best rate/.test(m) && (cat || prods.length)) {
    const c = cat || prods[0].category;
    const list = db.prepare("SELECT id, slug, name, unit, price, city FROM products WHERE category = ? AND price IS NOT NULL AND status='active' ORDER BY price LIMIT 5").all(c);
    return {
      text: `Lowest ${c.replace(/-/g, ' ')} prices on Zarea right now:`,
      table: { cols: ['Product', 'Price', 'Ships from'], rows: list.map((p) => [p.name, `${fmt(p.price)} / ${p.unit}`, p.city]) },
      links: list.slice(0, 1).map((p) => ({ label: `Buy ${p.name}`, href: `/product?slug=${p.slug}` })),
    };
  }

  // Trend
  if (/trend|history|chart|last \d+|month|week|going up|going down|mehnga|sasta ho/.test(m) && prods.length) {
    const p = prods[0]; const s = priceStats(p.id);
    const h = db.prepare('SELECT MIN(price) lo, MAX(price) hi FROM price_history WHERE product_id = ? AND day >= date(\'now\', \'-90 day\')').get(p.id);
    const dir = s.d30 > 1 ? 'rising' : s.d30 < -1 ? 'easing' : 'broadly stable';
    return {
      text: `**${p.name}** is ${dir}: ${pct(s.d7)} over 7 days and ${pct(s.d30)} over 30 days. 90-day range ${fmt(h.lo)} – ${fmt(h.hi)}.`,
      links: [{ label: 'View chart & set a price alert', href: `/product?slug=${p.slug}` }],
    };
  }

  // Price lookup
  if (prods.length || cat) {
    if (!prods.length) prods = db.prepare("SELECT id, slug, name, category, unit, price, city FROM products WHERE category = ? AND price IS NOT NULL AND status='active' ORDER BY price").all(cat);
    if (city) { const local = prods.filter((p) => p.city === city); if (local.length) prods = local; }
    const rows = prods.slice(0, 8).map((p) => { const s = priceStats(p.id); return [p.name, `${fmt(p.price)} / ${p.unit}`, pct(s.d7), p.city]; });
    return {
      text: `Today's marketplace prices${city ? ` (ships from ${city} where available)` : ''}:`,
      table: { cols: ['Product', 'Price', '7 days', 'Ships from'], rows },
      links: [{ label: 'Full daily price board', href: `/prices${cat ? `?category=${cat}` : ''}` }],
    };
  }

  return {
    text: "I didn't catch that. I can answer price, comparison, freight, construction estimate, credit and order-tracking questions. Try one of these:",
    suggestions: SUGGEST,
  };
}
